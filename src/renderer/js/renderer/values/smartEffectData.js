import { deepEqual } from "../utils.js";

export class SmartEffectDataValue {
    #shouldRender = false;
    #effectData = {
        name: 'Unnamed Effect',
        parameters: {},
        styles: {},
        shadow: { children: [] },
        parameterValues: {}
    };
    #pendingEffectData = this.#effectData;
    #parameterValues = {};

    constructor(data) {
        if (data) this.setEffectData(data);
    }

    get shouldRender() {
        return this.#shouldRender;
    }

    get effectData() {
        return structuredClone(this.#effectData);
    }

    /**
     * Sets the raw effect data, which includes the template and parameter definitions.
     * This will reset any custom parameter values to the defaults defined in the new data.
     * @param {object} data The effect data object.
     * @returns {boolean} True if the new data is different and a render is required.
     */
    setEffectData(data) {
        data = structuredClone(data);
        const effectData = {};
        effectData.name = data?.name || 'Unnamed Effect';
        effectData.parameters = data?.parameters || {};
        effectData.styles = data?.styles || {};
        effectData.shadow = data?.shadow || { children: [] };

        this.#pendingEffectData = effectData;

        const newParameterValues = {};
        for (const key in effectData.parameters) {
            newParameterValues[key] = effectData.parameters[key].default;
        }

        const isDifferent = !deepEqual(this.#effectData, this.#pendingEffectData);

        if (isDifferent) {
            this.#parameterValues = newParameterValues;
            this.#shouldRender = true;
            return true;
        }

        return false;
    }

    /**
     * Updates the value of a single parameter.
     * @param {string} key The name of the parameter to update.
     * @param {*} value The new value for the parameter.
     * @returns {boolean} True if the value changed and a render is required.
     */
    setParameterValue(key, value) {
        if (this.#effectData.parameters.hasOwnProperty(key)) {
            if (!deepEqual(this.#parameterValues[key], value)) {
                this.#parameterValues[key] = value;
                this.#shouldRender = true;
                return true;
            }
        }
        return false;
    }

    /**
     * Recursively resolves expressions in the provided data object.
     * @param {*} data The data to resolve (e.g., styles or shadow object).
     * @param {object} params The parameter values to use for resolution.
     * @returns {*} The data with all expressions resolved.
     */
    _resolveExpressions(data, params) {
        if (typeof data === 'string') {
            const match = data.trim().match(/^\$\{(.*)\}$/);
            if (match) {
                const expression = match[1];
                try {
                    const paramKeys = Object.keys(params);
                    const paramValues = Object.values(params);
                    const func = new Function(...paramKeys, `return ${expression}`);
                    const result = func(...paramValues);
                    return this._formatParameterValue(result);
                } catch (e) {
                    console.error(`Error evaluating expression: ${expression}`, e);
                    return data;
                }
            }
            return data.replace(/\$\{(.*?)\}/g, (match, expression) => {
                try {
                    const paramKeys = Object.keys(params);
                    const paramValues = Object.values(params);
                    const func = new Function(...paramKeys, `return ${expression}`);
                    return func(...paramValues);
                } catch (e) {
                    console.error(`Error evaluating expression: ${expression}`, e);
                    return match;
                }
            });
        }

        if (Array.isArray(data)) {
            return data.map(item => this._resolveExpressions(item, params));
        }

        if (typeof data === 'object' && data !== null) {
            const newData = {};
            for (const key in data) {
                newData[key] = this._resolveExpressions(data[key], params);
            }
            return newData;
        }

        return data;
    }

    /**
     * Formats a resolved parameter value (e.g., a gradient object) into a CSS string.
     * @param {*} value The value to format.
     * @returns {string} The formatted value.
     */
    _formatParameterValue(value) {
        if (typeof value !== 'object' || value === null) {
            return value;
        }
        if (value.type === 'radial' || value.type === 'linear') {
            return this._formatGradient(value);
        }
        return value;
    }

    _formatGradient(gradient) {
        const colorStops = gradient.colorStops
            .map(stop => `${stop.color} ${stop.position}%`)
            .join(', ');
        if (gradient.type === 'radial') {
            return `radial-gradient(circle, ${colorStops})`;
        }
        if (gradient.type === 'linear') {
            const angle = gradient.angle !== undefined ? gradient.angle : '180deg';
            return `linear-gradient(${angle}, ${colorStops})`;
        }
        return '';
    }

    diffStyles(sheet, oldStyles, newStyles) {
        const allSelectors = new Set([...Object.keys(oldStyles), ...Object.keys(newStyles)]);

        allSelectors.forEach(selector => {
            const oldProps = oldStyles[selector];
            const newProps = newStyles[selector];

            if (oldProps && !newProps) {
                const ruleIndex = this._findRuleIndex(sheet, selector);
                if (ruleIndex > -1) sheet.deleteRule(ruleIndex);
                return;
            }

            if (!oldProps && newProps) {
                const ruleString = this._buildCssRuleString(selector, newProps);
                sheet.insertRule(ruleString, sheet.cssRules.length);
                return;
            }

            if (!deepEqual(oldProps, newProps)) {
                const ruleIndex = this._findRuleIndex(sheet, selector);
                if (ruleIndex === -1) return;

                const rule = sheet.cssRules[ruleIndex];
                const allPropKeys = new Set([...Object.keys(oldProps), ...Object.keys(newProps)]);

                allPropKeys.forEach(propName => {
                    const oldVal = oldProps[propName];
                    const newVal = newProps[propName];
                    const cssPropName = propName.replace(/[A-Z]/g, m => `-${m.toLowerCase()}`);

                    if (oldVal !== undefined && newVal === undefined) {
                        rule.style.removeProperty(cssPropName);
                    } else if (oldVal !== newVal) {
                        rule.style.setProperty(cssPropName, newVal);
                    }
                });
            }
        });
    }

    /**
     * This function now handles SVG namespaces.
     * It accepts a namespace argument and uses `createElementNS` to correctly create
     * SVG elements and their children, which was the cause of the original issue.
     */
    createElement(vNode, namespace = 'http://www.w3.org/1999/xhtml') {
        if (!vNode || !vNode.tag) return null;

        // If the tag is 'svg', switch to the SVG namespace for this element and its children.
        const isSvg = vNode.tag.toLowerCase() === 'svg';
        const elNamespace = isSvg ? 'http://www.w3.org/2000/svg' : namespace;

        // Use `createElementNS` to handle namespaces correctly.
        const el = document.createElementNS(elNamespace, vNode.tag);

        if (vNode.attributes) {
            for (const [key, value] of Object.entries(vNode.attributes)) {
                // Check for the special 'classList' key
                if (key === 'classList' && Array.isArray(value)) {
                    el.classList.add(...value);
                } else {
                    el.setAttribute(key, value);
                }
            }
        }

        if (vNode.children) {
            vNode.children.forEach(childNode => {
                // Pass the current namespace down to child elements.
                const childEl = this.createElement(childNode, elNamespace);
                if (childEl) {
                    el.appendChild(childEl);
                }
            });
        }
        return el;
    }

    /**
     * FIXED: This function now correctly handles `classList` updates.
     * Instead of treating `classList` as a standard attribute, it compares the
     * old and new class arrays and adds/removes classes individually.
     */
    diffAttributes(element, oldAttrs, newAttrs) {
        const allKeys = new Set([...Object.keys(oldAttrs), ...Object.keys(newAttrs)]);

        allKeys.forEach(key => {
            const oldVal = oldAttrs[key];
            const newVal = newAttrs[key];

            if (key === 'classList') {
                const oldClasses = Array.isArray(oldVal) ? oldVal : [];
                const newClasses = Array.isArray(newVal) ? newVal : [];

                // Remove classes that are no longer present
                oldClasses.forEach(className => {
                    if (!newClasses.includes(className)) {
                        element.classList.remove(className);
                    }
                });

                // Add new classes
                newClasses.forEach(className => {
                    if (!oldClasses.includes(className)) {
                        element.classList.add(className);
                    }
                });
                return; // Continue to the next attribute
            }

            if (newVal === undefined) {
                element.removeAttribute(key);
            } else if (oldVal !== newVal) {
                element.setAttribute(key, newVal);
            }
        });
    }

    /**
     * Calls to `createElement` are updated to initiate the process
     * correctly without a namespace, letting the `createElement` function manage it.
     */
    diffElements(parent, oldVNode, newVNode, index = 0) {
        // This guard prevents the error from the stack trace.
        // If the parent for this level of recursion is undefined, we can't proceed.
        if (!parent) {
            return;
        }

        const realNode = parent.children[index];

        // Case 1: REMOVAL - The VDOM node is gone, so remove the real DOM node.
        if (oldVNode && !newVNode) {
            if (realNode) parent.removeChild(realNode);
            return;
        }

        // Case 2: ADDITION - A new VDOM node appeared, so create and append a new real node.
        if (!oldVNode && newVNode) {
            const newNode = this.createElement(newVNode);
            if (newNode) parent.appendChild(newNode);
            return;
        }

        // We shouldn't proceed if either VDOM node is missing at this point.
        if (!oldVNode || !newVNode) {
            return;
        }

        // Case 3: REPLACEMENT - The node tag changed, so replace the real node entirely.
        if (this.nodesChanged(oldVNode, newVNode)) {
            const newNode = this.createElement(newVNode);
            if (realNode && newNode) parent.replaceChild(newNode, realNode);
            return;
        }

        // Case 4: UPDATE - The nodes are the same type.
        // We only proceed if a corresponding real node actually exists in the DOM.
        if (realNode) {
            // First, update the attributes on the existing node.
            this.diffAttributes(realNode, oldVNode.attributes || {}, newVNode.attributes || {});

            // Then, recursively diff the children of this node.
            const oldChildren = oldVNode.children || [];
            const newChildren = newVNode.children || [];
            const maxLength = Math.max(oldChildren.length, newChildren.length);

            for (let i = 0; i < maxLength; i++) {
                // The recursive call is now safe because we've confirmed `realNode` exists.
                this.diffElements(realNode, oldChildren[i], newChildren[i], i);
            }
        }
    }

    /**
     * FIXED: This function no longer considers a `classList` change as a reason
     * to replace the entire node, as `diffAttributes` now handles it.
     */
    nodesChanged(node1, node2) {
        return node1.tag !== node2.tag;
    }

    _findRuleIndex(sheet, selector) {
        const rules = sheet.cssRules;
        for (let i = 0; i < rules.length; i++) {
            const ruleSelector = rules[i].selectorText || rules[i].name;
            if (ruleSelector === selector) {
                return i;
            }
        }
        return -1;
    }

    _buildCssRuleString(selector, props) {
        // Check if it's a keyframe rule
        if (selector.startsWith('@keyframes')) {
            let keyframeBlocks = '';
            // Iterate over the keyframe percentages ("0%", "100%", etc.)
            for (const keyframe in props) {
                const keyframeProps = props[keyframe];
                let propsString = '';
                // Build the style string for this specific keyframe
                for (const property in keyframeProps) {
                    const cssProperty = property.replace(/[A-Z]/g, m => `-${m.toLowerCase()}`);
                    propsString += `${cssProperty}: ${keyframeProps[property]};`;
                }
                keyframeBlocks += `${keyframe} { ${propsString} } `;
            }
            // Return the complete, valid @keyframes rule
            return `${selector} { ${keyframeBlocks} }`;
        }

        // Original logic for all other standard CSS rules
        let propsString = '';
        for (const property in props) {
            const cssProperty = property.replace(/[A-Z]/g, m => `-${m.toLowerCase()}`);
            propsString += `${cssProperty}: ${props[property]};`;
        }
        return `${selector} { ${propsString} }`;
    }

    rerenderStyles(element) {
        const shadowRoot = element.domElement.shadowRoot;
        const styleElement = shadowRoot.getElementById('smart-effect-styles');
        if (styleElement) {
            shadowRoot.removeChild(styleElement);
        }

        const styleEl = document.createElement('style');
        styleEl.id = 'smart-effect-styles';
        shadowRoot.appendChild(styleEl);

        const resolvedStyles = this._resolveExpressions(this.#effectData.styles, this.#parameterValues);
        const sheet = styleEl.sheet;

        for (const selector in resolvedStyles) {
            const props = resolvedStyles[selector];
            const ruleString = this._buildCssRuleString(selector, props);
            sheet.insertRule(ruleString, sheet.cssRules.length);
        }
    }

    applyDifferences(element) {
        if (!this.#shouldRender) return;
        if (!this.#pendingEffectData && !this.effectData) return;

        const oldParamValues = this.#effectData.parameterValues || {};
        const oldResolvedStyles = this._resolveExpressions(this.#effectData.styles, oldParamValues);
        const oldResolvedShadow = this._resolveExpressions(this.#effectData.shadow, oldParamValues);

        const newResolvedStyles = this._resolveExpressions(this.#pendingEffectData.styles, this.#parameterValues);
        const newResolvedShadow = this._resolveExpressions(this.#pendingEffectData.shadow, this.#parameterValues);

        if (this.#pendingEffectData.name !== this.#effectData.name) {
            element.name = this.#pendingEffectData.name;
        }

        const shadowRoot = element.domElement.shadowRoot;
        const styleElement = shadowRoot.getElementById('smart-effect-styles');

        this.diffStyles(styleElement.sheet, oldResolvedStyles, newResolvedStyles);

        const oldShadowChildren = oldResolvedShadow?.children || [];
        const newShadowChildren = newResolvedShadow?.children || [];
        const maxLength = Math.max(oldShadowChildren.length, newShadowChildren.length);

        for (let i = 0; i < maxLength; i++) {
            this.diffElements(shadowRoot, oldShadowChildren[i], newShadowChildren[i], i + 1);
        }

        this.#effectData = this.#pendingEffectData;
        this.#effectData.parameterValues = { ...this.#parameterValues };

        this.#shouldRender = false;
    }

    markAsDirty() {
        this.#shouldRender = true;
    }
}


