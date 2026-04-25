/*
 * batchProcess.jsx - Batch Processing Module
 * Processes all PNG files in a folder with color correction
 *
 * ExtendScript ES3/ES5 only
 */

// ============================================================
// Batch process all PNGs in a folder
// ============================================================

function batchProcessFolder(inputFolderPath, outputFolderPath, gamma, rgbStrength, alphaStrength, astcStrength) {
    try {
        var inputFolder = new Folder(inputFolderPath);
        var outputFolder = new Folder(outputFolderPath);

        if (!inputFolder.exists) {
            return "ERROR: 輸入資料夾不存在 Input folder not found";
        }

        // Create output folder if it doesn't exist
        if (!outputFolder.exists) {
            var created = outputFolder.create();
            if (!created) {
                return "ERROR: 無法建立輸出資料夾 Cannot create output folder";
            }
        }

        // Get all PNG files
        var pngFiles = inputFolder.getFiles("*.png");
        var pngFilesUpper = inputFolder.getFiles("*.PNG");

        // Merge lists (avoid duplicates on case-insensitive systems)
        var allFiles = [];
        var fileNames = {};

        var i;
        for (i = 0; i < pngFiles.length; i++) {
            var name = pngFiles[i].name.toLowerCase();
            if (!fileNames[name]) {
                fileNames[name] = true;
                allFiles.push(pngFiles[i]);
            }
        }
        for (i = 0; i < pngFilesUpper.length; i++) {
            var nameU = pngFilesUpper[i].name.toLowerCase();
            if (!fileNames[nameU]) {
                fileNames[nameU] = true;
                allFiles.push(pngFilesUpper[i]);
            }
        }

        var total = allFiles.length;
        if (total === 0) {
            return "ERROR: 資料夾中沒有 PNG 檔案 No PNG files found";
        }

        var processed = 0;
        var skipped = 0;
        var errors = 0;

        // Store original preferences
        var originalDisplayDialogs = app.displayDialogs;
        app.displayDialogs = DialogModes.NO;

        for (i = 0; i < allFiles.length; i++) {
            var inputFile = allFiles[i];
            var outputPath = outputFolderPath + "/" + inputFile.name;

            // Send progress event to panel
            sendProgressEvent(i + 1, total, inputFile.name);

            // Process the file
            var result = processFile(
                inputFile.fsName,
                outputPath,
                gamma,
                rgbStrength,
                alphaStrength,
                astcStrength
            );

            if (result === "OK") {
                processed++;
            } else if (result === "SKIPPED") {
                skipped++;
                // Copy original file to output if skipped (no alpha = no correction needed)
                copyFile(inputFile, new File(outputPath));
            } else {
                errors++;
            }
        }

        // Restore preferences
        app.displayDialogs = originalDisplayDialogs;

        return "done:" + processed + ":" + skipped + ":" + total;

    } catch (e) {
        try {
            app.displayDialogs = DialogModes.ALL;
        } catch (e2) {}
        return "ERROR: " + e.message;
    }
}

// ============================================================
// Send progress event to the CEP panel
// ============================================================

function sendProgressEvent(current, total, fileName) {
    try {
        var xLib;
        // Use the CSXSEvent to communicate with the panel
        // This requires the ExternalObject library
        if (typeof ExternalObject !== "undefined") {
            xLib = new ExternalObject("lib:\PlugPlugExternalObject");
        }

        if (xLib) {
            var eventObj = new CSXSEvent();
            eventObj.type = "com.unity.cc.batchProgress";
            eventObj.data = '{"current":' + current + ',"total":' + total + ',"fileName":"' + fileName.replace(/"/g, '\\"') + '"}';
            eventObj.dispatch();
        }
    } catch (e) {
        // PlugPlugExternalObject may not be available in all environments
        // Silently continue
    }
}

// ============================================================
// Copy file helper
// ============================================================

function copyFile(srcFile, destFile) {
    try {
        srcFile.copy(destFile);
    } catch (e) {
        // Ignore copy errors for skipped files
    }
}

// ============================================================
// Get PNG file count in a folder (utility for UI)
// ============================================================

function getPNGCount(folderPath) {
    try {
        var folder = new Folder(folderPath);
        if (!folder.exists) return "0";
        var files = folder.getFiles("*.png");
        return String(files.length);
    } catch (e) {
        return "0";
    }
}
