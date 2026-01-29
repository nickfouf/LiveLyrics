// src/renderer/js/mirror.js

let activeRequestId = 0;

export const MirrorManager = {
    startStream: async (sourceId, videoElementId) => {
        const video = document.getElementById(videoElementId);
        if (!video) {
            console.error('[MirrorManager] Video element not found:', videoElementId);
            return;
        }

        // Generate a new Request ID for this attempt
        const requestId = ++activeRequestId;

        console.log(`[MirrorManager] Starting stream from source: ${sourceId} (Req: ${requestId})`);

        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                audio: false,
                video: {
                    mandatory: {
                        chromeMediaSource: 'desktop',
                        chromeMediaSourceId: sourceId,
                        maxWidth: 1280,   // or 854 for 480p
                        maxHeight: 720,
                        minWidth: 640,
                        minHeight: 360,
                        minFrameRate: 15,
                        maxFrameRate: 30
                    }
                }
            });

            // Race Condition Check:
            // If stopStream() was called or a new startStream() was initiated 
            // while we were waiting for the promise, abort this one.
            if (requestId !== activeRequestId) {
                console.log(`[MirrorManager] Stream request ${requestId} was cancelled or superseded. Stopping tracks.`);
                stream.getTracks().forEach(track => track.stop());
                return;
            }

            video.srcObject = stream;
            video.onloadedmetadata = () => {
                // Double-check strict validity before showing
                if (requestId !== activeRequestId) return;

                video.play().catch(e => console.error("[MirrorManager] Play failed:", e));
                video.style.display = 'block';
            };
            
            console.log(`[MirrorManager] Stream started successfully (Req: ${requestId}).`);
            
            stream.oninactive = () => {
                console.log('[MirrorManager] Stream ended (inactive).');
                // Only hide if this is still the active stream
                if (requestId === activeRequestId) {
                    video.style.display = 'none';
                }
            };

        } catch (e) {
            // Only log errors if this was the active request (suppress cancellations)
            if (requestId === activeRequestId) {
                console.error('[MirrorManager] Error starting stream:', e);
                video.style.display = 'none';
            }
        }
    },

    stopStream: (videoElementId) => {
        // Invalidate any pending async start operations
        activeRequestId++;

        const video = document.getElementById(videoElementId);
        if (!video) return;

        const stream = video.srcObject;
        if (stream) {
            const tracks = stream.getTracks();
            tracks.forEach(track => track.stop());
            video.srcObject = null;
        }
        video.style.display = 'none';
        console.log('[MirrorManager] Stream stopped.');
    }
};