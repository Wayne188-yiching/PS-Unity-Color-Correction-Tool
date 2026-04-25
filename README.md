# Photoshop to Unity Linear Color Space 校正工具

> 讓 Photoshop 設計的半透明 UI 素材在 Unity Linear Color Space 中呈現一致的視覺效果。

---

## 目錄

- [專案背景](#專案背景)
- [工具目標](#工具目標)
- [技術原理](#技術原理)
  - [Gamma vs Linear Alpha Blending](#gamma-vs-linear-alpha-blending)
  - [sRGB Transfer Function 精確定義](#srgb-transfer-function-精確定義)
  - [Premultiplied Alpha vs Straight Alpha](#premultiplied-alpha-vs-straight-alpha)
  - [Unity Texture Import Pipeline](#unity-texture-import-pipeline)
  - [校正策略](#校正策略)
- [功能需求](#功能需求)
- [技術實作建議](#技術實作建議)
- [預期輸出檔案結構](#預期輸出檔案結構)
- [驗證標準](#驗證標準)
- [使用者工作流程](#使用者工作流程)
- [注意事項](#注意事項)
- [已知限制與未來改進](#已知限制與未來改進)
- [參考資料](#參考資料)
- [License](#license)

---

## 專案背景

在遊戲 UI 製作流程中，美術在 **Photoshop (Gamma 2.2 色彩空間)** 中設計半透明 UI 元素，匯出 PNG 後導入 **Unity (Linear Color Space + ASTC 6x6 壓縮)**。由於兩者的色彩空間與 Alpha Blending 數學不同，導致：

- 半透明區域在 Unity 中偏亮 / 偏白
- Alpha 漸變邊緣過渡不自然
- ASTC 有損壓縮進一步劣化 Alpha 通道品質
- 整體視覺觀感與 Photoshop 設計稿不一致

### 限制條件 (不可讈更)

| 項目                    | 設定值                             |
| ----------------------- | ---------------------------------- |
| Unity Color Space       | **Linear**                         |
| 紋理壓縮格式            | **ASTC 6x6**                       |
| Texture Import Settings | sRGB (Color Texture) ON, Alpha Is Transparency ON |

---

## 工具目標

製作一個 **Photoshop 腳本 (JSX 或 CEP Panel)**，讓美術在匯出圖片前一鍵執行校正，使同一張 PNG 在 Photoshop 和 Unity Linear + ASTC 6x6 環境下視覺呈現一致。

---

## 技術原理

### Gamma vs Linear Alpha Blending

**Photoshop 混合公式 (Gamma 空間)：**

Photoshop 直接在 Gamma-encoded 數值上做混合，不做任何色彩空間轉換：

```
result_gamma = src_gamma * alpha + dst_gamma * (1 - alpha)
```

**Unity Linear 混合公式：**

Unity 在 Linear Color Space 模式下，會先將 sRGB 紋理解碼至 Linear 空間，在 Linear 空間做混合，最後再編碼回 Gamma 空間輸出到螢幕：

```
src_linear = sRGB_to_Linear(src_gamma)    // 近似 src_gamma ^ 2.2
dst_linear = sRGB_to_Linear(dst_gamma)    // 近似 dst_gamma ^ 2.2
result_linear = src_linear * alpha + dst_linear * (1 - alpha)
result_gamma = Linear_to_sRGB(result_linear)  // 近似 result_linear ^ (1/2.2)
```

兩者對相同 Alpha 值產生不同的視覺混合結果，尤其在 Alpha 0.2 ~ 0.8 範圍差異最大。

### sRGB Transfer Function 精確定義

實際的 sRGB 標準並非單純的 `x ^ 2.2`，而是包含一段線性區間的分段函式：

**sRGB to Linear (解碼)：**

```
if C_srgb <= 0.04045:
    C_linear = C_srgb / 12.92
else:
    C_linear = ((C_srgb + 0.055) / 1.055) ^ 2.4
```

**Linear to sRGB (編碼)：**

```
if C_linear <= 0.0031308:
    C_srgb = C_linear * 12.92
else:
    C_srgb = 1.055 * C_linear ^ (1/2.4) - 0.055
```

> **注意：** 在本工具的校正中，使用簡化的 `^2.2` 近似已足夠。精確的 sRGB Transfer Function 在此列出作為參考，若需要更高精度的校正可採用完整分段函式。

### Premultiplied Alpha vs Straight Alpha

理解 Alpha 的儲存方式對校正邏輯至關重要：

| 類型                     | RGB 儲存方式           | 混合公式                                              |
| ------------------------ | ---------------------- | ----------------------------------------------------- |
| **Straight Alpha**       | 原始 RGB 值            | `result = src_rgb * src_a + dst_rgb * (1 - src_a)`    |
| **Premultiplied Alpha**  | RGB 已乘以 Alpha       | `result = src_rgb + dst_rgb * (1 - src_a)`            |

- **Photoshop** 匯出的 PNG 預設使用 **Straight Alpha**
- **Unity** 的 `Alpha Is Transparency` 選項會在 import 時將邊緣像素做 premultiply 處理以消除黑邊 (black fringe)
- 本工具的校正邏輯基於 **Straight Alpha** 的 PNG 輸入；若素材使用 Premultiplied Alpha，RGB 校正公式需要相應調整 (先 unpremultiply，校正後再 premultiply)

### Unity Texture Import Pipeline

當一張標記為 sRGB 的紋理被 import 到 Unity (Linear Color Space) 時，處理流程如下：

```
PNG 檔案 (sRGB Gamma-encoded)
    |
    v
[1] Texture Importer 讀取原始像素
    |
    v
[2] 若 "Alpha Is Transparency" = ON:
    |   對邊緣像素做 alpha dilate，消除黑邊
    |
    v
[3] 壓縮為 ASTC 6x6 (有損壓縮，在 sRGB 空間進行)
    |
    v
[4] Shader 取樣時：
    |   若紋理標記為 sRGB → GPU 硬體自動做 sRGB-to-Linear 解碼 (^2.2)
    |   Alpha 通道不做 gamma 解碼 (保持 linear)
    |
    v
[5] Linear 空間 Blending (由 GPU 執行)
    |
    v
[6] 寫入 Framebuffer 後，最終輸出時做 Linear-to-sRGB 編碼 (^(1/2.2))
```

> **關鍵：** RGB 通道會被 GPU 做 `^2.2` 解碼；Alpha 通道 **不會** 被 gamma 解碼，始終以 linear 方式處理。這是 RGB 和 Alpha 需要不同校正策略的根本原因。

### 校正策略

#### 1. RGB 校正

**目的：** 讓像素在被 Unity `^2.2` 解碼後，混合結果仍接近 Photoshop Gamma 空間的視覺效果。

**原理：** Unity 的 GPU 會對 sRGB 紋理做 `^2.2` 解碼。如果我們預先對 RGB 做 `^(1/2.2)` 提亮，那麼經過 Unity 的 `^2.2` 解碼後會回到接近原始值 -- 但這等於沒校正。

實際上，我們需要做的是讓 **Linear 空間的混合結果** 逼近 **Gamma 空間的混合結果**。這意味著 RGB 需要做 `^gamma` (即 `^2.2`) 的預校正，使得：

```
校正後的像素在 Unity 中的行為：
  1. 儲存值: corrected_rgb = original_rgb ^ 2.2
  2. GPU 解碼: corrected_rgb ^ (1/2.2) ≈ 接近用於 linear blending 的目標值
     但因為 ^2.2 再 ^(1/2.2) 會回到原值...
```

**實務上的正確做法：** 這不是一個簡單的單一 gamma 讈換可以解決的問題。精確的校正取決於混合的目標色 (destination color) 和 Alpha 值。偽代碼中採用的 `rgb ^ gamma` 是一個近似方案，透過將 RGB 壓暗來補償 Linear Blending 天生偏亮的特性，搭配 `rgbStrength` 參數讓使用者可以微調強度。

```
corrected_rgb = pow(rgb, gamma) * strength + rgb * (1 - strength)
```

其中 `gamma = 2.2`, `strength` 為使用者可調的 RGB 校正強度 (預設 1.0)。

#### 2. Alpha 校正

**目的：** 讓 Linear Blending 的透明度感知接近 Gamma Blending。

**原理：** 在 Gamma 空間中，Alpha 0.5 會產生視覺上「一半透明」的效果。但在 Linear 空間中，同樣的 Alpha 0.5 會因為 linear-light 混合而看起來更透明。對 Alpha 做 `^(1/2.2)` 可以提高 Alpha 值，補償這個差異。

```
corrected_alpha = pow(alpha, 1.0 / gamma) * strength + alpha * (1 - strength)
```

其中 `gamma = 2.2`, `strength` 為使用者可調的 Alpha 校正強度 (預設 1.0)。

#### 3. ASTC 壓縮補償

ASTC 6x6 是有損壓縮，會模糊 Alpha 通道 (每個 6x6 block 內的 Alpha 值被量化為有限的插值等級)。對 Alpha 通道做輕微銳化 / 對比增強可以補償：

- 補償量需要可調節 (建議預設 5~15%)
- 過度補償會導致 Alpha 邊緣出現鋸齒

---

## 功能需求

### 功能 1：一鍵校正 (核心功能)

- 對當前打開的 PSD/PNG 檔案執行校正
- 校正作用於 **所有半透明像素** (`alpha > 0` 且 `alpha < 255`)
- 完全不透明 (`alpha = 255`) 和完全透明 (`alpha = 0`) 的像素不做處理
- 校正後生成新的圖層或新文件，**不破壞原始檔案**

### 功能 2：參數調節面板

提供以下可調參數 (帶合理預設值)：

| 參數             | 預設值 | 範圍      | 說明                         |
| ---------------- | ------ | --------- | ---------------------------- |
| Gamma 值         | 2.2    | 1.8 ~ 2.4 | 目標色彩空間的 Gamma 值      |
| RGB 校正強度     | 100%   | 0 ~ 150%  | RGB 通道的校正程度           |
| Alpha 校正強度   | 100%   | 0 ~ 150%  | Alpha 通道的校正程度         |
| ASTC 補償強度    | 10%    | 0 ~ 30%   | Alpha 銳化補償量             |
| 預覽開關         | ON     | ON / OFF  | 即時預覽校正效果             |

### 功能 3：Unity Linear 模擬預覽

- 在 Photoshop 內模擬 Unity Linear Color Space 的渲染結果
- 讓美術可以在 Photoshop 中看到「這張圖在 Unity 裡會長什麼樣」
- 實作方式：暫時套用調整圖層 (Curves / Levels) 模擬 Linear Blending
- 預覼應可切換 ON / OFF

### 功能 4：ASTC 6x6 壓縮品質預覽 (加分項)

- 模擬 ASTC 6x6 有損壓縮對 Alpha 通道的劣化效果
- 可以用降低 Alpha 通道解析度 + 輕微模糊來近似模擬
- 讓美術預估匯出到 Unity 後的最終品質

### 功能 5：批次處理

- 支持對指定資料夾內所有 PNG 檔案批次執行校正
- 輸出到指定的目標資料夾
- 顯示處理進度
- 跳過不含 Alpha 通道的圖片

---

## 技術實作建議

### 方案 A：CEP Panel (推薦)

- 使用 Adobe CEP (Common Extensibility Platform) 架構
- 前端：HTML / CSS / JS 製作 UI 面板
- 後端：ExtendScript (JSX) 處理像素操作
- 優點：有完整 UI、可即時預覽、使用者高驗好
- 相容性：Photoshop CC 2019+

### 方案 B：純 JSX 腳本

- 單一 `.jsx` 檔案，透過 File > Scripts > Browse 執行
- 用 ScriptUI 製作簡易對話框
- 優點：部署簡單、無需簽名
- 缺點：UI 較陽春、即時預覽較難實現

### 像素操作核心邏輯 (偽代碼)

```javascript
/**
 * 核心校正函式
 * 
 * @param {number} r - Red channel (0-255)
 * @param {number} g - Green channel (0-255)
 * @param {number} b - Blue channel (0-255)
 * @param {number} a - Alpha channel (0-255)
 * @param {number} gamma - Target gamma value (default: 2.2)
 * @param {number} rgbStrength - RGB correction strength, 0.0 ~ 1.5 (default: 1.0)
 * @param {number} alphaStrength - Alpha correction strength, 0.0 ~ 1.5 (default: 1.0)
 * @returns {{ r: number, g: number, b: number, a: number }}
 */
function correctPixelForLinear(r, g, b, a, gamma, rgbStrength, alphaStrength) {
    // 只處理半透明像素
    if (a === 0 || a === 255) return { r: r, g: g, b: b, a: a };

    // 歸一化到 0~1
    var normA = a / 255.0;
    var normR = r / 255.0;
    var normG = g / 255.0;
    var normB = b / 255.0;

    // === RGB 校正 ===
    // 將 RGB 做 ^gamma (壓暗) 來補償 Unity Linear Blending 偏亮的問題
    // pow(rgb, 2.2) 會讓值變小 (更暗)，使得 linear blending 結果不再過亮
    // rgbStrength 控制校正量：1.0 = 完全校正, 0.0 = 不校正
    var corrR = Math.pow(normR, gamma) * rgbStrength + normR * (1.0 - rgbStrength);
    var corrG = Math.pow(normG, gamma) * rgbStrength + normG * (1.0 - rgbStrength);
    var corrB = Math.pow(normB, gamma) * rgbStrength + normB * (1.0 - rgbStrength);

    // === Alpha 校正 ===
    // 將 Alpha 做 ^(1/gamma) (提亮) 來補償 Linear Blending 透明度感知差異
    // pow(alpha, 1/2.2) 會讓值變大，使半透明區域不會在 Unity 中看起來太透明
    var invGamma = 1.0 / gamma;
    var corrA = Math.pow(normA, invGamma) * alphaStrength + normA * (1.0 - alphaStrength);

    // Clamp to [0, 1]
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
/**
 * ASTC 6x6 壓縮對 Alpha 通道的影響模擬
 * ASTC 將影像分割為固定大小的 block，每個 block 內的值被量化為
 * 有限的端點 (endpoints) 和插值等級 (interpolation weights)。
 * 
 * @param {number[][]} alphaChannel - 2D Alpha 資料
 * @param {number} blockSize - Block 大小 (ASTC 6x6 = 6)
 */
function simulateASTCAlpha(alphaChannel, blockSize) {
    // blockSize = 6 for ASTC 6x6
    // 1. 將 Alpha 通道按 6x6 block 分區
    // 2. 每個 block 內取最小/最大值做端點量化
    //    (ASTC 只保留有限的 endpoint 值)
    // 3. block 內的值做線性插值近似
    // 這會造成漸變邊緣出現階梯感和模糊

    for each 6x6 block in alphaChannel {
        var minVal = block.min();
        var maxVal = block.max();
        // 量化到有限位數 (ASTC 通常 8 個插值等級)
        for each pixel in block {
            pixel = quantize(pixel, minVal, maxVal, 8);
        }
    }
}
```

---

## 預期輸出檔案結構

```
PS_Unity_ColorCorrection/
├── manifest.json            # CEP 插件描述
├── csxs/
│   └── manifest.xml         # 插件配置
├── js/
│   ├── main.js              # 前端邏輯
│   └── CSInterface.js       # Adobe CEP 通訊層
├── jsx/
│   ├── hostscript.jsx       # 核心校正邏輯
│   ├── batchProcess.jsx     # 批次處理邏輯
│   └── preview.jsx          # 預覽功能
├── css/
│   └── style.css            # 面板樣式
├── index.html               # 面板 UI
└── README.md                # 使用說明
```

---

## 驗證標準

工具完成後，需通過以下驗證：

1. **單色半透明測試** -- 在 Photoshop 建立 50% 透明度的純藍色色塊，校正後匯入 Unity，與 Photoshop 視覺對比差異 deltaE < 3
2. **漸變測試** -- Alpha 從 0 到 255 的漸變條，Unity 中的過渡曲線應與 Photoshop 視覺一致
3. **複雜 UI 測試** -- 實際遊戲 Lobby UI (含多層半透明疊加)，校正前後在 Unity 中對比
4. **ASTC 壓縮測試** -- 開啟 ASTC 補償後，Alpha 邊緣的鋸齒 / 模糊應有可見改善
5. **批次處理測試** -- 100 張 PNG 批次處理，無報錯，輸出格式正確
6. **非破壞性測試** -- 校正後原始 PSD 未被修改

---

## 使用者工作流程

```
美術在 Photoshop 完成設計
    |
    v
打開校正工具面板
    |
    v
點擊「Unity 預覽」 --> 確認 Unity 中的預期效果
    |
    v
調整參數 (如需要)
    |
    v
點擊「校正並匯出」
    |
    v
選擇輸出資料夾
    |
    v
得到校正後的 PNG --> 直接丟進 Unity 使用
    |
    v
Unity 中的視覺效果 ≈ Photoshop 設計稿
```

---

## 注意事項

- 此工具 **僅處理 UI 用途** 的半透明素材，不適用於 3D 材質貼圖
- 完全不透明的圖片 (如背景圖) 不需要校正，工具應自動跳過
- 校正是 **單向的**：校正後的 PNG 在 Photoshop 中看起來會跟原始稿略有不同，但在 Unity 中會正確
- 如果美術需要在 Photoshop 中繼續編輯，應保留原始 PSD，只對匯出用的 PNG 做校正
- Gamma 值預設 2.2 適用於大多數情況，macOS 顯示器若使用不同 Gamma 需要調整
- 本工具假設輸入為 **Straight Alpha** 的 PNG；若使用 Premultiplied Alpha 的素材，需先 unpremultiply 再校正

---

## 已知限制與未來改進

### 已知限制

- **校正為近似解：** RGB 的 `^gamma` 校正是一個全域近似，無法完美匹配所有 destination color 組合下的 blending 結果。實際效果會因疊加的背景色不同而有輕微偏差。
- **不支援 HDR：** 本工具僅針對 8-bit sRGB 色彩空間設計，不適用於 HDR (16-bit / 32-bit) 工作流程。
- **ASTC 模擬為近似：** 實際 ASTC 壓縮的 endpoint 選擇和 weight 量化演算法比模擬更複雜，模擬結果僅供參考。
- **不處理多圖層混合：** 校正是逐像素進行的，無法考慮 Photoshop 中多圖層的 blending mode 交互。建議先 flatten 可見圖層再校正。
- **CEP 即將淘汰：** Adobe 正在將插件架構從 CEP 遷移至 UXP (Unified Extensibility Platform)。CEP 在 Photoshop 2025+ 可能不再支援。

### 未來改進

- [ ] 遷移至 **UXP Plugin** 架構 (Photoshop 2022+)
- [ ] 支援 **per-layer 校正**，保留圖層結構
- [ ] 加入 **A/B 對比預覽** (校正前 vs 校正後 side-by-side)
- [ ] 支援 **ETC2 / BC7** 等其他壓縮格式的補償
- [ ] 提供 **Unity Editor 端驗證工具**，自動比對校正前後的 deltaE
- [ ] 研究基於 **LUT (Look-Up Table)** 的校正方案，提升大圖處理速度

---

## 參考資料

- [sRGB Standard - IEC 61966-2-1](https://www.color.org/chardata/rgb/srgb.xalter) -- sRGB Transfer Function 官方定義
- [Unity Manual - Linear or Gamma Workflow](https://docs.unity3d.com/Manual/LinearRendering-LinearOrGammaWorkflow.html) -- Unity 色彩空間設定說明
- [Unity Manual - Texture Import Settings](https://docs.unity3d.com/Manual/class-TextureImporter.html) -- Texture Importer 參數詳解
- [ARM ASTC Texture Compression](https://developer.arm.com/documentation/102162/latest/) -- ASTC 壓縮格式技術細節
- [GPU Gems 3, Ch. 24 - The Importance of Being Linear](https://developer.nvidia.com/gpugems/gpugems3/part-iv-image-effects/chapter-24-importance-being-linear) -- Gamma vs Linear Rendering 原理
- [Photoshop Scripting Guide](https://extendscript.docsforadobe.dev/) -- ExtendScript / CEP 開發文件
- [Adobe UXP Developer Guide](https://developer.adobe.com/photoshop/uxp/) -- 下一代 Photoshop 插件架構
- [Alpha Compositing - Wikipedia](https://en.wikipedia.org/wiki/Alpha_compositing) -- Alpha Blending 數學原理，含 Premultiplied Alpha 說明

---

## License

本專案採用 [MIT License](LICENSE) 授權。

```
MIT License

Copyright (c) 2026

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```
