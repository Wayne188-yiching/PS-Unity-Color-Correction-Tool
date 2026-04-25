/*
 * CSInterface.js - Adobe CEP Communication Layer
 * Based on Adobe CSInterface v11
 * Provides communication between HTML panel and ExtendScript host.
 */

/**
 * @class CSInterface
 * Core class for CEP panel communication with the host application.
 */
function CSInterface() {
    this.EXTENSION_PATH = "extension";
    this.USER_DATA_PATH = "userData";
    this.COMMON_FILES_PATH = "commonFiles";
    this.HOST_APPLICATION_PATH = "hostApplication";
}
CSInterface.prototype.getAPIVersion = function () { var v = window.__adobe_cep__ ? JSON.parse(window.__adobe_cep__.getCurrentApiVersion()) : { major: 11, minor: 0, micro: 0 }; return v; };
CSInterface.prototype.getHostEnvironment = function () { if (window.__adobe_cep__) return JSON.parse(window.__adobe_cep__.getHostEnvironment()); return { appName: "PHXS", appVersion: "24.0" }; };
CSInterface.prototype.evalScript = function (s, cb) { if (window.__adobe_cep__) { cb ? window.__adobe_cep__.evalScript(s, cb) : window.__adobe_cep__.evalScript(s); } else { console.log("[CSI]", s); if (cb) cb("Error: __adobe_cep__ not available"); } };
CSInterface.prototype.getSystemPath = function (t) { if (window.__adobe_cep__) return window.__adobe_cep__.getSystemPath(t); return { extension: "./", userData: "~/" }[t] || "./"; };
CSInterface.prototype.openURLInDefaultBrowser = function (u) { window.__adobe_cep__ ? window.__adobe_cep__.openURLInDefaultBrowser(u) : window.open(u); };
CSInterface.prototype.addEventListener = function (t, l, o) { if (window.__adobe_cep__) window.__adobe_cep__.addEventListener(t, l, o); };
CSInterface.prototype.removeEventListener = function (t, l, o) { if (window.__adobe_cep__) window.__adobe_cep__.removeEventListener(t, l, o); };
CSInterface.prototype.dispatchEvent = function (e) { if (window.__adobe_cep__) { if (typeof e.data === "object") e.data = JSON.stringify(e.data); window.__adobe_cep__.dispatchEvent(e); } };
CSInterface.prototype.closeExtension = function () { if (window.__adobe_cep__) window.__adobe_cep__.closeExtension(); };
CSInterface.prototype.getScaleFactor = function () { return window.__adobe_cep__ ? window.__adobe_cep__.getScaleFactor() : 1; };
CSInterface.prototype.getExtensionID = function () { return window.__adobe_cep__ ? window.__adobe_cep__.getExtensionId() : "com.unity.colorcorrection.panel"; };
function CSEvent(t, s, a, e) { this.type = t; this.scope = s || "APPLICATION"; this.appId = a || ""; this.extensionId = e || ""; this.data = ""; }
CSInterface.prototype.SystemPath = { EXTENSION: "extension", USER_DATA: "userData", COMMON_FILES: "commonFiles", HOST_APPLICATION: "hostApplication" };
