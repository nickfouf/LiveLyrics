#include <napi.h>
#include <thread>
#include <chrono>
#include <string>

// Platform-specific includes
#ifdef _WIN32
#include <winsock2.h>
#include <iphlpapi.h>
#include <ws2tcpip.h>
#pragma comment(lib, "IPHLPAPI.lib")
#pragma comment(lib, "ws2_32.lib")
#endif

// A thread-safe function to call from our monitoring thread back into JavaScript
Napi::ThreadSafeFunction tsfn;

// --- OS-Specific Monitoring Implementation ---

// This is a complete, working implementation for Windows.
#ifdef _WIN32
void StartMonitoring_Windows() {
    HANDLE hAddrChange = INVALID_HANDLE_VALUE;
    OVERLAPPED overlap;
    overlap.hEvent = WSACreateEvent();

    // This is the core Windows API call. It will block until a network address change occurs.
    DWORD ret = NotifyAddrChange(&hAddrChange, &overlap);

    while (true) {
        if (ret != NO_ERROR && WSAGetLastError() != WSA_IO_PENDING) {
            // Error occurred, stop monitoring
            break;
        }

        if (WaitForSingleObject(overlap.hEvent, INFINITE) == WAIT_OBJECT_0) {
            // An address change occurred!
            // We notify the JavaScript side that a change happened.
            // The JS side will then re-scan its interfaces. This is simpler than
            // trying to pass all the details from C++.
            if (tsfn) {
                tsfn.BlockingCall([](Napi::Env env, Napi::Function jsCallback) {
                    jsCallback.Call({});
                });
            }

            // Re-register for the next notification
            ret = NotifyAddrChange(&hAddrChange, &overlap);
        }
    }
    WSACloseEvent(overlap.hEvent);
}
#endif

void StartMonitoring_Mac() {
    // macOS implementation would go here.
    // You would use the System Configuration framework (SCNetworkReachability)
    // to listen for network configuration changes and trigger the tsfn.
}

void StartMonitoring_Linux() {
    // Linux implementation would go here.
    // You would use Netlink sockets to subscribe to RTMGRP_LINK and
    // RTMGRP_IPV4_IFADDR events and trigger the tsfn.
}

// --- Addon Setup ---

// This function will be run on a separate C++ thread
void monitorThread() {
    // Call the correct implementation based on the OS
#ifdef _WIN32
    StartMonitoring_Windows();
#elif __APPLE__
    StartMonitoring_Mac();
#elif __linux__
    StartMonitoring_Linux();
#endif
}

// Function called from JavaScript to start monitoring
Napi::Value Start(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    if (info.Length() < 1 || !info[0].IsFunction()) {
        Napi::TypeError::New(env, "Function expected as argument").ThrowAsJavaScriptException();
        return env.Null();
    }

    // Create a ThreadSafeFunction to safely call the JS callback from our C++ thread
    tsfn = Napi::ThreadSafeFunction::New(
        env,
        info[0].As<Napi::Function>(), // JavaScript function to call
        "NetworkMonitorCallback",     // Resource name
        0,                            // Max queue size (0 = unlimited)
        1,                            // Initial thread count
        [](Napi::Env) {               // Finalizer
            // Release the TSFN when the addon is unloaded
        });

    // =================================================================
    // Added this block to fire the callback immediately upon starting.
    // =================================================================
    tsfn.BlockingCall([](Napi::Env env, Napi::Function jsCallback) {
        jsCallback.Call({});
    });
    // =================================================================


    // Start the background monitoring thread
    std::thread t(monitorThread);
    t.detach(); // Let the thread run independently

    return env.Undefined();
}

// This is the entry point for the addon
Napi::Object Init(Napi::Env env, Napi::Object exports) {
    // Export a single function, "start"
    exports.Set(Napi::String::New(env, "start"), Napi::Function::New(env, Start));
    return exports;
}

NODE_API_MODULE(network_monitor_addon, Init)