/*
 * hostscript.jsx - Core Color Correction Logic
 * PS -> Unity Linear Color Space Correction
 *
 * Handles pixel-level RGB and Alpha correction for semi-transparent pixels
 * to compensate for gamma vs linear blending differences.
 *
 * IMPORTANT: ExtendScript ES3/ES5 only - no ES6 syntax
 */

// ============================================================
// Utility: Folder selector
// ============================================================

function selectFolder(prompt) {
    try {
        var folder = Folder.selectDialog(prompt);
        if (folder) {
            return folder.fsName;
        }
        return "null";
    } catch (e) {
        return "ERROR: " + e.message;
    }
}