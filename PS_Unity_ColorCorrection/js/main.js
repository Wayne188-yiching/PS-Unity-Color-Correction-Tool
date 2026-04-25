/*
 * main.js - PS Unity Color Correction Panel Frontend Logic
 * Controls parameter UI, communicates with ExtendScript via CSInterface
 */

var csInterface = new CSInterface();

// Global state
var batchInputFolder = "";
var batchOutputFolder = "";
var isProcessing = false;
var previewActive = false;

// ============================================================
// Initialization
// ============================================================

(function init() {
    // Load the ExtendScript files
    var extPath = csInterface.getSystemPath("extension");

    // Load all JSX modules
    var jsxFiles = [
        "/jsx/hostscript.jsx",
        "/jsx/preview.jsx",
        "/jsx/batchProcess.jsx"
    ];

    for (var i = 0; i < jsxFiles.length; i++) {
        loadJSX(extPath + jsxFiles[i]);
    }

    // Bind slider events
    bindSlider("sliderGamma", "valGamma", formatGamma);
    bindSlider("sliderRGB", "valRGB", formatPercent);
    bindSlider("sliderAlpha", "valAlpha", formatPercent);
    bindSlider("sliderASTC", "valASTC", formatPercent);

    // Listen for batch progress events from ExtendScript
    csInterface.addEventListener("com.unity.cc.batchProgress", onBatchProgress);
})();

function loadJSX(path) {
    csInterface.evalScript('$.evalFile("' + path.replace(/\\/g, "/") + '")');
}

// ============================================================
// Formatters
// ============================================================

function formatGamma(val) {
    return parseFloat(val).toFixed(2);
}

function formatPercent(val) {
    return Math.round(val) + "%";
}

// ============================================================
// Slider Binding
// ============================================================

function bindSlider(sliderId, valueId, formatter) {
    var slider = document.getElementById(sliderId);
    var display = document.getElementById(valueId);

    slider.addEventListener("input", function () {
        display.textContent = formatter(slider.value);
    });

    // Set initial display
    display.textContent = formatter(slider.value);
}

// ============================================================
// Get current parameters
// ============================================================

function getParams() {
    return {
        gamma: parseFloat(document.getElementById("sliderGamma").value),
        rgbStrength: parseInt(document.getElementById("sliderRGB").value, 10) / 100.0,
        alphaStrength: parseInt(document.getElementById("sliderAlpha").value, 10) / 100.0,
        astcStrength: parseInt(document.getElementById("sliderASTC").value, 10) / 100.0
    };
}

// ============================================================
// Status helpers
// ============================================================

function setStatus(elementId, message, type) {
    var el = document.getElementById(elementId);
    el.textContent = message;
    el.className = "status-bar" + (type ? " " + type : "");
}

function setButtonEnabled(btnId, enabled) {
    document.getElementById(btnId).disabled = !enabled;
}

// ============================================================
// One-Click Correction
// ============================================================

function doCorrection() {
    if (isProcessing) return;
    isProcessing = true;

    var params = getParams();
    setStatus("statusCorrect", "校正中... Correcting...", "working");
    setButtonEnabled("btnCorrect", false);

    var script = 'correctCurrentDocument(' +
        params.gamma + ', ' +
        params.rgbStrength + ', ' +
        params.alphaStrength + ', ' +
        params.astcStrength + ')';

    csInterface.evalScript(script, function (result) {
        isProcessing = false;
        setButtonEnabled("btnCorrect", true);

        if (result && result.indexOf("ERROR") === 0) {
            setStatus("statusCorrect", result, "error");
        } else if (result === "NO_DOC") {
            setStatus("statusCorrect", "請先開啟文件 No document open", "error");
        } else {
            setStatus("statusCorrect", "校正完成! Correction complete!", "success");
        }
    });
}

// ============================================================
// Unity Linear Preview Toggle
// ============================================================

function toggleLinearPreview() {
    var checkbox = document.getElementById("togglePreview");
    var enable = checkbox.checked;
    var params = getParams();

    if (enable) {
        setStatus("statusPreview", "建立預覽... Creating preview...", "working");
        var script = 'createLinearPreview(' + params.gamma + ')';
        csInterface.evalScript(script, function (result) {
            if (result && result.indexOf("ERROR") === 0) {
                setStatus("statusPreview", result, "error");
                checkbox.checked = false;
            } else if (result === "NO_DOC") {
                setStatus("statusPreview", "請先開啟文件 No document open", "error");
                checkbox.checked = false;
            } else {
                previewActive = true;
                setStatus("statusPreview", "預覾開啟 Preview ON", "success");
            }
        });
    } else {
        csInterface.evalScript('removeLinearPreview()', function (result) {
            previewActive = false;
            setStatus("statusPreview", "預覾關閉 Preview OFF", "");
        });
    }
}

// ============================================================
// Batch Processing - Folder Selection
// ============================================================

function selectInputFolder() {
    var script = 'selectFolder("選擇輸入資料夾 Select Input Folder")';
    csInterface.evalScript(script, function (result) {
        if (result && result !== "null" && result !== "undefined" && result.indexOf("ERROR") !== 0) {
            batchInputFolder = result;
            document.getElementById("pathInput").textContent = shortenPath(result);
            document.getElementById("pathInput").title = result;
        }
    });
}

function selectOutputFolder() {
    var script = 'selectFolder("選擇輸出資料夾 Select Output Folder")';
    csInterface.evalScript(script, function (result) {
        if (result && result !== "null" && result !== "undefined" && result.indexOf("ERROR") !== 0) {
            batchOutputFolder = result;
            document.getElementById("pathOutput").textContent = shortenPath(result);
            document.getElementById("pathOutput").title = result;
        }
    });
}

function shortenPath(path) {
    if (!path) return "";
    // Show last 40 chars with ellipsis
    if (path.length > 40) {
        return "..." + path.substring(path.length - 40);
    }
    return path;
}

// ============================================================
// Batch Processing - Execute
// ============================================================

function doBatchProcess() {
    if (isProcessing) return;

    if (!batchInputFolder) {
        setStatus("statusBatch", "請先選擇輸入資料夾 Select input folder", "error");
        return;
    }
    if (!batchOutputFolder) {
        setStatus("statusBatch", "請先選擇輸出資料夾 Select output folder", "error");
        return;
    }

    isProcessing = true;
    setButtonEnabled("btnBatch", false);
    setButtonEnabled("btnSelectInput", false);
    setButtonEnabled("btnSelectOutput", false);

    // Show progress bar
    var progressContainer = document.getElementById("progressContainer");
    progressContainer.className = "progress-container visible";
    updateProgress(0, 0);

    setStatus("statusBatch", "處理中... Processing...", "working");

    var params = getParams();
    var script = 'batchProcessFolder(' +
        '"' + batchInputFolder.replace(/\\/g, "\\\\") + '", ' +
        '"' + batchOutputFolder.replace(/\\/g, "\\\\") + '", ' +
        params.gamma + ', ' +
        params.rgbStrength + ', ' +
        params.alphaStrength + ', ' +
        params.astcStrength + ')';

    csInterface.evalScript(script, function (result) {
        isProcessing = false;
        setButtonEnabled("btnBatch", true);
        setButtonEnabled("btnSelectInput", true);
        setButtonEnabled("btnSelectOutput", true);

        if (result && result.indexOf("ERROR") === 0) {
            setStatus("statusBatch", result, "error");
        } else {
            // Parse result: "done:processed:skipped:total"
            var parts = result ? result.split(":") : [];
            if (parts.length >= 4) {
                var processed = parts[1];
                var skipped = parts[2];
                var total = parts[3];
                updateProgress(parseInt(total, 10), parseInt(total, 10));
                setStatus("statusBatch",
                    "完成! Done! " + processed + " 處理 / " + skipped + " 跳過 skipped",
                    "success");
            } else {
                setStatus("statusBatch", "批次處理完成 Batch complete", "success");
            }
        }
    });
}

function onBatchProgress(event) {
    try {
        var data = (typeof event.data === "string") ? JSON.parse(event.data) : event.data;
        updateProgress(data.current, data.total);
        if (data.fileName) {
            setStatus("statusBatch", "處理 Processing: " + data.fileName, "working");
        }
    } catch (e) {
        // Ignore parse errors
    }
}

function updateProgress(current, total) {
    var pct = total > 0 ? Math.round((current / total) * 100) : 0;
    document.getElementById("progressFill").style.width = pct + "%";
    document.getElementById("progressText").textContent = current + " / " + total;
}

// ============================================================
// Reset Parameters
// ============================================================

function resetParams() {
    document.getElementById("sliderGamma").value = 2.2;
    document.getElementById("sliderRGB").value = 100;
    document.getElementById("sliderAlpha").value = 100;
    document.getElementById("sliderASTC").value = 10;

    document.getElementById("valGamma").textContent = "2.20";
    document.getElementById("valRGB").textContent = "100%";
    document.getElementById("valAlpha").textContent = "100%";
    document.getElementById("valASTC").textContent = "10%";

    // Turn off preview if active
    if (previewActive) {
        document.getElementById("togglePreview").checked = false;
        toggleLinearPreview();
    }

    setStatus("statusCorrect", "", "");
    setStatus("statusBatch", "", "");
    setStatus("statusPreview", "", "");
}
