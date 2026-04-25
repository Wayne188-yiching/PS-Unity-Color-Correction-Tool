/*
 * preview.jsx - Unity Linear Color Space Preview Module
 * Simulates how the image will look in Unity's Linear rendering pipeline
 * using Curves adjustment layers in Photoshop.
 *
 * ExtendScript ES3/ES5 only
 */

// Preview layer group name (used to identify and remove)
var PREVIEW_GROUP_NAME = "__Unity_Linear_Preview__";

// ============================================================
// Create Unity Linear Preview
// Adds adjustment layers that simulate Unity's linear rendering
// ============================================================

function createLinearPreview(gamma) {
    try {
        if (!app.documents.length) {
            return "NO_DOC";
        }

        var doc = app.activeDocument;

        // Remove existing preview first
        removeLinearPreviewInternal(doc);

        // Create a layer group at the top for the preview adjustments
        var previewGroup = doc.layerSets.add();
        previewGroup.name = PREVIEW_GROUP_NAME;

        // Move the group to the top
        previewGroup.move(doc.layers[0], ElementPlacement.PLACEBEFORE);

        // Unity Linear simulation:
        // 1. sRGB textures are converted to linear space (gamma decode: ^2.2)
        // 2. Blending happens in linear space
        // 3. Final output is converted back to sRGB (gamma encode: ^(1/2.2))
        //
        // For opaque pixels: decode then encode = identity (no visible change)
        // For semi-transparent: blending in linear causes visible difference
        //
        // We simulate this with a Curves adjustment:
        // Apply gamma 2.2 curve (simulating the decode step's effect on blending)

        // Create the simulation curve
        // This shows how semi-transparent colors will appear brighter in Unity
        // due to linear-space blending
        createGammaCurveAdjustment(gamma);

        return "OK";
    } catch (e) {
        return "ERROR: " + e.message;
    }
}

// ============================================================
// Remove Unity Linear Preview
// ============================================================

function removeLinearPreview() {
    try {
        if (!app.documents.length) {
            return "NO_DOC";
        }

        var doc = app.activeDocument;
        removeLinearPreviewInternal(doc);
        return "OK";
    } catch (e) {
        return "ERROR: " + e.message;
    }
}

// ============================================================
// Internal: Remove preview layers
// ============================================================

function removeLinearPreviewInternal(doc) {
    // Search for and remove the preview group
    for (var i = doc.layerSets.length - 1; i >= 0; i--) {
        if (doc.layerSets[i].name === PREVIEW_GROUP_NAME) {
            doc.layerSets[i].remove();
        }
    }

    // Also check for standalone adjustment layers with our name
    for (var j = doc.artLayers.length - 1; j >= 0; j--) {
        if (doc.artLayers[j].name === PREVIEW_GROUP_NAME ||
            doc.artLayers[j].name === "__Unity_Linear_Curve__") {
            doc.artLayers[j].remove();
        }
    }
}

// ============================================================
// Create a Curves adjustment layer simulating gamma decode
// This approximates how Unity's linear pipeline affects appearance
// ============================================================

function createGammaCurveAdjustment(gamma) {
    // Build curve points for the gamma simulation
    // This curve simulates: output = pow(input, 1/gamma)
    // Which shows how linear-space blending brightens mid-tones
    var invGamma = 1.0 / gamma;

    var curvePoints = [];
    var numPoints = 14;

    for (var i = 0; i <= numPoints; i++) {
        var inputVal = Math.round((i / numPoints) * 255);
        var v = inputVal / 255.0;
        // Simulate the brightening effect of linear blending
        var outputVal = Math.round(Math.pow(v, invGamma) * 255);
        outputVal = Math.max(0, Math.min(255, outputVal));
        curvePoints.push(inputVal);
        curvePoints.push(outputVal);
    }

    // Create Curves adjustment layer via Action Manager
    var desc = new ActionDescriptor();
    var ref = new ActionReference();
    ref.putClass(stringIDToTypeID("adjustmentLayer"));
    desc.putReference(charIDToTypeID("null"), ref);

    var descLayer = new ActionDescriptor();
    descLayer.putString(charIDToTypeID("Nm  "), "__Unity_Linear_Curve__");

    var descType = new ActionDescriptor();

    // Build the curve for the composite (RGB) channel
    var adjList = new ActionList();
    var curvAdj = new ActionDescriptor();

    var chanRef = new ActionReference();
    chanRef.putEnumerated(charIDToTypeID("Chnl"), charIDToTypeID("Chnl"), charIDToTypeID("Cmps"));
    curvAdj.putReference(charIDToTypeID("Chnl"), chanRef);

    var ptList = new ActionList();
    for (var j = 0; j < curvePoints.length; j += 2) {
        var ptDesc = new ActionDescriptor();
        ptDesc.putDouble(charIDToTypeID("Hrzn"), curvePoints[j]);
        ptDesc.putDouble(charIDToTypeID("Vrtc"), curvePoints[j + 1]);
        ptList.putObject(charIDToTypeID("Pnt "), ptDesc);
    }
    curvAdj.putList(charIDToTypeID("Crv "), ptList);
    adjList.putObject(charIDToTypeID("CrvA"), curvAdj);

    descType.putList(charIDToTypeID("Adjs"), adjList);
    descLayer.putObject(charIDToTypeID("Type"), charIDToTypeID("Crvs"), descType);

    desc.putObject(charIDToTypeID("Usng"), charIDToTypeID("AdjL"), descLayer);

    executeAction(charIDToTypeID("Mk  "), desc, DialogModes.NO);

    // Move the adjustment layer into the preview group
    // It was created at the top of the layer stack, which is fine
    // Rename it to make it identifiable
    try {
        var doc = app.activeDocument;
        // The newly created layer is now active
        var adjLayer = doc.activeLayer;
        adjLayer.name = "__Unity_Linear_Curve__";

        // Try to move it into the preview group
        for (var k = 0; k < doc.layerSets.length; k++) {
            if (doc.layerSets[k].name === PREVIEW_GROUP_NAME) {
                adjLayer.move(doc.layerSets[k], ElementPlacement.INSIDE);
                break;
            }
        }
    } catch (e) {
        // If moving fails, the adjustment layer still works at the top level
    }
}
