# Photoshop → Unity Linear Color Space 校正工具 — 開發規格提示詞

## 📋 專案背景

在遊戲 UI 製作流程中，美術在 **Photoshop（Gamma 2.2 色彩空間）** 中設計半透明 UI 元素，匯出 PNG 後導入 **Unity（Linear 色彩空間 + ASTC 6x6 壓縮）**。由於兩者的色彩空間與 Alpha 混合數學不同，導致：

- 半透明區域在 Unity 中偏亮 / 偏白
- Alpha 漸變邊緣過渡不自然
- ASTC 有損壓縮進一步劣化 Alpha 通道品質
- 整體視覺觀感與 PS 設計稿不一致

**限制條件（不可變更）：**
- Unity 專案必須使用 **Linear Color Space**
- 紋理壓縮格式鎖定為 **ASTC 6x6**
- 紋理 Import Settings: sRGB ✓, Alpha Is Transparency ✓

---

## 🎯 工具目標

製作一個 **Photoshop 腳本（JSX 或 CEP Panel）**，讓美術在匯出圖片前一鍵執行校正，使同一張 PNG 在 Photoshop 和 Unity Linear + ASTC 6x6 環境下視覺呈現一致。

---

## 🔬 技術原理

### 核心問題：Gamma vs Linear Alpha Blending

Photoshop 混合公式（Gamma 空間）：
```
result_gamma = src_gamma × alpha + dst_gamma × (1 - alpha)
```

Unity Linear 混合公式：
```
src_linear = src_gamma ^ 2.2
dst_linear = dst_gamma ^ 2.2
result_linear = src_linear × alpha + dst_linear × (1 - alpha)
result_gamma = result_linear ^ (1/2.2)
```

兩者對相同 alpha 值產生不同的視覺混合結果，尤其在 alpha 0.2 ~ 0.8 範圍差異最大。

### 校正策略

1. **RGB 校正**：對半透明像素的 RGB 值施加 **反向 Gamma 補償**
   - 將 RGB 從 Gamma 空間預轉為 Linear 空間的等效值
   - 公式：`corrected_rgb = rgb ^ (1 / 2.2)` 的反向調整

2. **Alpha 校正**：調整 Alpha 通道的曲線
   - 使 Linear 空間混合後的結果視覺上等同於 Gamma 空間混合
   - 近似公式：`corrected_alpha = alpha ^ (1 / 2.2)`（需根據實測微調）

3. **ASTC 壓縮補償**：對 Alpha 通道做輕微銳化/對比增強
   - 因為 ASTC 6x6 會模糊 Alpha 通道
   - 補償量需要可調節（建議預設 5~15%）

---

## 📐 功能需求

### 功能 1：一鍵校正（核心功能）

- 對當前打開的 PSD/PNG 檔案執行 Gamma → Linear 色彩校正
- 校正作用於**所有半透明像素**（alpha > 0 且 alpha < 255）
- 完全不透明（alpha = 255）和完全透明（alpha = 0）的像素不做處理
- 校正後生成新的圖層或新文件，**不破壞原始檔案**

### 功能 2：參數調節面板

提供以下可調參數（帶合理預設值）：

| 參數 | 預設值 | 範圍 | 說明 |
|------|--------|------|------|
| Gamma 值 | 2.2 | 1.8 ~ 2.4 | 目標色彩空間的 Gamma 值 |
| RGB 校正強度 | 100% | 0 ~ 150% | RGB 通道的校正程度 |
| Alpha 校正強度 | 100% | 0 ~ 150% | Alpha 通道的校正程度 |
| ASTC 補償強度 | 10% | 0 ~ 30% | Alpha 銳化補償量 |
| 預覽開關 | ON | ON/OFF | 即時預覽校正效果 |

### 功能 3：Unity Linear 模擬預覽

- 在 PS 內模擬 Unity Linear 色彩空間的渲染結果
- 讓美術可以在 PS 中看到「這張圖在 Unity 裡會長什麼樣」
- 實作方式：臨時套用調整圖層（Curves / Levels）模擬 Linear 混合
- 預覽應可切換 ON/OFF

### 功能 4：ASTC 6x6 壓縮品質預覽（加分項）

- 模擬 ASTC 6x6 有損壓縮對 Alpha 通道的劣化效果
- 可以用降低 Alpha 通道解析度 + 輕微模糊來近似模擬
- 讓美術預估匯出到 Unity 後的最終品質

### 功能 5：批次處理

- 支持對指定資料夾內所有 PNG 檔案批次執行校正
- 輸出到指定的目標資料夾
- 顯示處理進度
- 跳過不含 Alpha 通道的圖片

---

## 🏗️ 技術實作建議

### 方案 A：CEP Panel（推薦）

- 使用 Adobe CEP (Common Extensibility Platform) 架構
- 前端：HTML/CSS/JS 製作 UI 面板
- 後端：ExtendScript (JSX) 處理像素操作
- 優點：有完整 UI、可即時預覽、使用者體驗好
- 相容性：Photoshop CC 2019+

### 方案 B：純 JSX 腳本

- 單一 .jsx 檔案，透過 File → Scripts → Browse 執行
- 用 ScriptUI 製作簡易對話框
- 優點：部署簡單、無需簽名
- 缺點：UI 較陽春、即時預覽較難實現

### 像素操作核心邏輯（偽代碼）

```javascript
// 核心校正函式
function correctPixelForLinear(r, g, b, a, gamma, rgbStrength, alphaStrength) {
    // 只處理半透明像素
    if (a === 0 || a === 255) return { r, g, b, a };
    
    // 歸一化到 0~1
    var normA = a / 255.0;
    var normR = r / 255.0;
    var normG = g / 255.0;
    var normB = b / 255.0;
    
    // === RGB 校正 ===
    // 預補償：讓 Linear 空間解讀後的視覺結果接近 Gamma 空間
    // 對 Premultiplied alpha 的 RGB 做 Gamma 編碼補償
    var invGamma = 1.0 / gamma;
    
    var corrR = Math.pow(normR, gamma) * rgbStrength + normR * (1.0 - rgbStrength);
    var corrG = Math.pow(normG, gamma) * rgbStrength + normG * (1.0 - rgbStrength);
    var corrB = Math.pow(normB, gamma) * rgbStrength + normB * (1.0 - rgbStrength);
    
    // === Alpha 校正 ===
    // 補償 Linear 混合對 Alpha 感知的差異
    var corrA = Math.pow(normA, invGamma) * alphaStrength + normA * (1.0 - alphaStrength);
    
    // Clamp
    corrR = Math.max(0, Math.min(1, corrR));
    corrG = Math.max(0, Math.min(1, corrG));
    corrB = Math.max(0, Math.min(1, corrB));
    corrA = Math.max(0, Math.min(1, corrA));
    
    return {
        r: Math.round(corrR * 255),
        g: Math.round(corrG * 255),
        b: Math.round(corrB * 255),
        a: Math.round(corrA * 255)
    };
}
```

### ASTC 壓縮模擬邏輯

```javascript
// ASTC 6x6 壓縮對 Alpha 的影響模擬
function simulateASTCAlpha(alphaChannel, blockSize) {
    // blockSize = 6 for ASTC 6x6
    // 1. 將 Alpha 通道按 6x6 block 分區
    // 2. 每個 block 內取最小/最大值做量化（ASTC 只保留有限的端點值）
    // 3. block 內的值做線性插值近似
    // 這會造成漸變邊緣出現階梯感和模糊
    
    for each 6x6 block in alphaChannel {
        var minVal = block.min();
        var maxVal = block.max();
        // 量化到有限位數（ASTC 通常 8 個插值等級）
        for each pixel in block {
            pixel = quantize(pixel, minVal, maxVal, 8);
        }
    }
}
```

---

## 📁 預期輸出檔案結構

```
PS_Unity_ColorCorrection/
├── manifest.json          # CEP 插件描述
├── csxs/                  
│   └── manifest.xml       # 插件配置
├── js/
│   ├── main.js            # 前端邏輯
│   └── CSInterface.js     # Adobe CEP 通訊層
├── jsx/
│   ├── hostscript.jsx     # 核心校正邏輯
│   ├── batchProcess.jsx   # 批次處理邏輯
│   └── preview.jsx        # 預覽功能
├── css/
│   └── style.css          # 面板樣式
├── index.html             # 面板 UI
└── README.md              # 使用說明
```

---

## 🧪 驗證標準

工具完成後，需通過以下驗證：

1. **單色半透明測試**：在 PS 建立 50% 透明度的純藍色色塊，校正後匯入 Unity，與 PS 視覺對比差異 < 5% (ΔE < 3)
2. **漸變測試**：Alpha 從 0 → 255 的漸變條，Unity 中的過渡曲線應與 PS 視覺一致
3. **複雜 UI 測試**：實際遊戲 Lobby UI（含多層半透明疊加），校正前後在 Unity 中對比
4. **ASTC 壓縮測試**：開啟 ASTC 補償後，Alpha 邊緣的鋸齒/模糊應有可見改善
5. **批次處理測試**：100 張 PNG 批次處理，無報錯，輸出格式正確
6. **非破壞性測試**：校正後原始 PSD 未被修改

---

## 🔄 工作流程（使用者視角）

```
美術在 PS 完成設計
    ↓
打開校正工具面板
    ↓
點擊「Unity 預覽」→ 確認 Unity 中的預期效果
    ↓
調整參數（如需要）
    ↓
點擊「校正並匯出」
    ↓
選擇輸出資料夾
    ↓
得到校正後的 PNG → 直接丟進 Unity 使用
    ↓
Unity 中的視覺效果 ≈ PS 設計稿
```

---

## ⚠️ 注意事項

- 此工具**僅處理 UI 用途**的半透明素材，不適用於 3D 材質貼圖
- 完全不透明的圖片（如背景圖）不需要校正，工具應自動跳過
- 校正是**單向的**：校正後的 PNG 在 PS 中看起來會跟原始稿略有不同，但在 Unity 中會正確
- 如果美術需要在 PS 中繼續編輯，應保留原始 PSD，只對匯出用的 PNG 做校正
- Gamma 值預設 2.2 適用於大多數情況，macOS 顯示器若使用不同 Gamma 需要調整
