## Smart Effect JSON Structure: A Comprehensive Guide

The Smart Effect system allows for the creation of dynamic, customizable, and self-contained visual components. These components are defined by a single JSON file that describes their user-configurable parameters, their styling, and their internal HTML/SVG structure.

The rendering engine parses this JSON file, creates a user interface for the defined `parameters`, and then uses the current parameter values to dynamically build the component's appearance and structure within a protected Shadow DOM.

### Top-Level JSON Structure

Every Smart Effect JSON file has four main properties at its root:

| Key          | Type   | Required | Description                                                                                                |
|--------------|--------|----------|------------------------------------------------------------------------------------------------------------|
| `name`       | String | Yes      | The display name of the effect, used within the user interface.                                            |
| `parameters` | Object | Yes      | Defines the user-configurable settings for the effect.                                                     |
| `styles`     | Object | Yes      | A dictionary of CSS rules that will be applied to the effect's Shadow DOM.                                 |
| `shadow`     | Object | Yes      | A Virtual DOM (VDOM) representation of the HTML and/or SVG elements that make up the effect's structure. |

**Example:** `ocean_waves.json`
```json
{
  "name": "Flowing Ocean Waves",
  "parameters": { ... },
  "styles": { ... },
  "shadow": { ... }
}
```

---

### 1. The `parameters` Object

This section defines every variable that a user can customize in the effect. Each key in the `parameters` object becomes a variable name that you can use in the `styles` and `shadow` sections.

Each parameter is an object with the following properties:

| Key       | Type        | Required | Description                                                                                                                                                           |
|-----------|-------------|----------|-----------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| `name`    | String      | Yes      | The human-readable label for the parameter shown in the editor UI.                                                                                                    |
| `type`    | String      | Yes      | The data type of the parameter. This determines the kind of editor control presented to the user (e.g., `color`, `number`, `gradient`).                                  |
| `default` | Any         | Yes      | The initial value of the parameter when the effect is first loaded. The structure of the `default` value must match the specified `type`.                               |
| `unit`    | String      | Optional | For `number` types, this specifies the unit (e.g., "px", "s", "%") to be displayed in the UI. It does not affect the raw value.                                        |

**Example:** From `ocean_waves.json`
```json
"parameters": {
  "oceanFloorColor": {
    "name": "Ocean Floor Color",
    "type": "color",
    "default": "#015871"
  },
  "waveHeight": {
    "name": "Wave Height",
    "type": "number",
    "default": 198,
    "unit": "px"
  },
  "backgroundGradient": {
    "name": "Background Gradient",
    "type": "gradient",
    "default": {
      "type": "radial",
      "colorStops": [
        { "color": "rgb(255, 254, 234)", "position": 0 },
        { "color": "rgb(183, 232, 235)", "position": 100 }
      ]
    }
  }
}
```
In this example, `oceanFloorColor`, `waveHeight`, and `backgroundGradient` are now variables available for use in expressions.

---

### 2. Expressions: The Core of Dynamic Behavior

The power of Smart Effects comes from expressions. You can inject the value of any parameter directly into your `styles` and `shadow` definitions. The engine will evaluate these expressions and substitute them with the parameter's current value before rendering.

**Syntax:** `${expression}`

The `expression` can be a simple parameter name or a JavaScript calculation involving one or more parameters.

*   **Simple Variable:** `"${oceanFloorColor}"` will be replaced with the value of the `oceanFloorColor` parameter (e.g., `"#015871"`).
*   **Complex Expression:** `"${waveSegmentWidth * 4}px"` will be evaluated. If `waveSegmentWidth` is `1600`, the result will be `"6400px"`.

---

### 3. The `styles` Object

This object defines the CSS for your component. It works similarly to a CSS-in-JS library.

*   **Keys:** The keys are standard CSS selectors, including pseudo-classes (`:host`), class selectors (`.wave`), and at-rules (`@keyframes wave`).
*   **Values:** The values are objects where keys are camelCased CSS properties (`marginLeft`) and values are the corresponding CSS values. These values can, and should, use **expressions**.

**Example:** From `ocean_waves.json`
```json
"styles": {
  ":host": {
    "background": "${backgroundGradient}",
    "overflow": "hidden"
  },
  ".ocean": {
    "background": "${oceanFloorColor}"
  },
  ".wave": {
    "top": "-${waveHeight}px",
    "width": "${waveSegmentWidth * 4}px",
    "animation": "wave ${animationDuration}s cubic-bezier(0.36, 0.45, 0.63, 0.53) infinite"
  },
  "@keyframes wave": {
    "0%": { "marginLeft": "0" },
    "100%": { "marginLeft": "-${waveSegmentWidth}px" }
  }
}
```
When rendered:
*   `${backgroundGradient}` is resolved into a full CSS gradient string (e.g., `radial-gradient(...)`).
*   `${oceanFloorColor}` becomes `#015871`.
*   `-${waveHeight}px` becomes `-198px`.
*   `-${waveSegmentWidth}px` becomes `-1600px`.

The engine injects these fully resolved rules into a `<style>` tag inside the component's Shadow DOM.

---

### 4. The `shadow` Object

This object defines the component's internal DOM structure using a "Virtual DOM" format. This structure is rendered inside the component's Shadow DOM, keeping it isolated from the main page.

The `shadow` object and its children have three properties:

| Key          | Type           | Required | Description                                                                                                                                                           |
|--------------|----------------|----------|-----------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| `tag`        | String         | Yes      | The name of the HTML or SVG element to create (e.g., `div`, `svg`, `path`).                                                                                           |
| `attributes` | Object         | Optional | A key-value map of attributes for the element. Values can use **expressions**.                                                                                        |
| `children`   | Array of Nodes | Optional | An array of child node objects, each following this same structure.                                                                                                   |

#### Special Attribute: `classList`
To assign CSS classes, use the `classList` attribute. Its value must be an array of strings.

**Example:** From `ocean_waves.json`
```json
"shadow": {
  "children": [
    {
      "tag": "div",
      "attributes": { "classList": ["ocean"] },
      "children": [
        {
          "tag": "div",
          "attributes": { "classList": ["wave", "layer1"] },
          "children": [
            {
              "tag": "svg",
              "attributes": {
                "width": "${waveSegmentWidth}",
                "height": "${waveHeight}"
              },
              "children": [
                {
                  "tag": "path",
                  "attributes": {
                    "fill": "url(#grad1)",
                    "d": "M.005 121C311 121...",
                    "transform": "matrix(-1 0 0 1 ${waveSegmentWidth} 0)"
                  }
                }
              ]
            }
          ]
        }
      ]
    }
  ]
}
```
When rendered:
*   A `div` with the class `ocean` is created.
*   Inside it, another `div` with classes `wave` and `layer1` is created.
*   Inside that, an `svg` element is created. Its `width` attribute is set to the value of `waveSegmentWidth` (e.g., "1600"), and its `height` is set to the value of `waveHeight` (e.g., "198").
*   The `transform` attribute on the `<path>` element is also dynamically calculated.

This entire structure is built and maintained by the rendering engine, which efficiently updates only the parts of the DOM that change when a parameter's value is modified.