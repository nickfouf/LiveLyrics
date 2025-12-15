// src/renderer/js/editor/propertiesDialog.js

import { getAvailablePropertiesForElement } from './utils.js';
import { makeDraggable } from './draggable.js';

let propertiesDialog, propertiesListContainer, totalPropsDisplay;
let localState = {
    selectedProperties: [],
    element: null,
    callback: null
};

function renderPropertyList() {
    if (!localState.element || !propertiesListContainer) return;

    propertiesListContainer.innerHTML = '';
    const availableProps = getAvailablePropertiesForElement(localState.element);

    for (const [groupName, props] of Object.entries(availableProps)) {
        const propGroup = document.createElement('div');
        propGroup.className = 'prop-group collapsed'; // Start collapsed by default

        let propsHTML = '';
        for (const [propKey, propDisplayName] of Object.entries(props)) {
            const isSelected = localState.selectedProperties.includes(propKey);
            const btnClass = isSelected ? 'remove-prop-btn' : 'add-prop-btn';
            const btnIcon = isSelected ? `<img src="../../icons/minus_blue.svg" alt="Remove">` : `<img src="../../icons/plus.svg" alt="Add">`;
            propsHTML += `
                <div class="prop-dialog-item" data-prop-key="${propKey}">
                    <span>${propDisplayName}</span>
                    <button class="${btnClass}" tabindex="-1">${btnIcon}</button>
                </div>`;
        }

        propGroup.innerHTML = `
            <div class="prop-group-header">
                <h4>${groupName}</h4>
                <div class="prop-group-header-buttons">
                    <span class="prop-toggle-btn">
                        <img src="../../icons/chevron-down.svg" alt="Toggle">
                    </span>
                </div>
            </div>
            <div class="prop-group-body">${propsHTML}</div>`;
        propertiesListContainer.appendChild(propGroup);
    }

    totalPropsDisplay.textContent = `Total Properties: ${localState.selectedProperties.length}`;
}

export function initPropertiesDialog() {
    const dialogHTML = `
        <div id="properties-dialog" class="dialog-overlay">
            <div class="dialog-content">
                <div class="dialog-header">Select Event Properties</div>
                <div class="dialog-body" id="properties-dialog-body">
                    <!-- Property list will be rendered here -->
                </div>
                <div class="dialog-footer">
                    <span id="total-props-display" style="margin-right: auto; color: #ccc;">Total Properties: 0</span>
                    <button id="pd-cancel-btn" class="action-btn secondary-btn">Cancel</button>
                    <button id="pd-ok-btn" class="action-btn primary-btn">OK</button>
                </div>
            </div>
        </div>`;
    document.body.insertAdjacentHTML('beforeend', dialogHTML);

    propertiesDialog = document.getElementById('properties-dialog');
    propertiesListContainer = document.getElementById('properties-dialog-body');
    totalPropsDisplay = document.getElementById('total-props-display');

    makeDraggable('properties-dialog');

    document.getElementById('pd-ok-btn').addEventListener('click', () => {
        if (localState.callback) {
            localState.callback(localState.selectedProperties);
        }
        propertiesDialog.classList.remove('visible');
    });

    document.getElementById('pd-cancel-btn').addEventListener('click', () => {
        propertiesDialog.classList.remove('visible');
    });

    propertiesListContainer.addEventListener('click', (e) => {
        const header = e.target.closest('.prop-group-header');
        if (header) {
            if (!e.target.closest('button')) {
                header.closest('.prop-group').classList.toggle('collapsed');
            }
            return;
        }

        const item = e.target.closest('.prop-dialog-item');
        if (item) {
            const propKey = item.dataset.propKey;
            const button = item.querySelector('button');
            const index = localState.selectedProperties.indexOf(propKey);

            if (index > -1) { // Is selected, so remove it
                localState.selectedProperties.splice(index, 1);
                button.classList.replace('remove-prop-btn', 'add-prop-btn');
                button.innerHTML = `<img src="../../icons/plus.svg" alt="Add">`;
            } else { // Not selected, so add it
                localState.selectedProperties.push(propKey);
                button.classList.replace('add-prop-btn', 'remove-prop-btn');
                button.innerHTML = `<img src="../../icons/minus_blue.svg" alt="Remove">`;
            }
            totalPropsDisplay.textContent = `Total Properties: ${localState.selectedProperties.length}`;
        }
    });
}

export function openPropertiesDialog(element, currentSelection, callback) {
    localState.element = element;
    localState.selectedProperties = [...currentSelection]; // Work on a copy
    localState.callback = callback;

    renderPropertyList();

    propertiesListContainer.querySelectorAll('.prop-group').forEach(group => {
        const hasSelectedProperty = group.querySelector('.remove-prop-btn');
        if (hasSelectedProperty) {
            group.classList.remove('collapsed');
        }
    });

    propertiesDialog.classList.add('visible');
}
