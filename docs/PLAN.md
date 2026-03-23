# AniMusePage — Museum Demo 实现计划

## Context
为 NeurIPS 论文做 Trailer 网站，核心是一个「Night at the Museum」风格的 3D 互动展示：
- 场景：博物馆展台，暗光、聚光灯、大理石地板
- 交互①：点击按钮，魔法闪光，静止动物开始动
- 交互②：Toggle 切换骨骼视图（bones.glb, 1.7MB）和网格视图（pred_compressed/pred.glb, 7.3MB）

技术栈：Three.js（含内置后处理、GLTFLoader、MeshoptDecoder） + Vite 开发服务器，全部本地安装，无全局污染。

托管：**GitHub Pages**（从 gh-pages 分支自动部署）

---

## GitHub Pages 配置要点
- Vite 需设置 `base: '/AniMusePage/'`（仓库名），否则资源路径 404
- GLB 文件（总计 ~9MB）直接 commit 进仓库，GitHub 可以正常 serve
- 未压缩的大文件（`data/viz/gt/`、`data/viz/pred/`，各 128MB）加入 `.gitignore` 不上传
- 部署方式：本地 `npm run build` → `npx gh-pages -d dist` 推到 `gh-pages` 分支
- GitHub 仓库 Settings → Pages → Source 设为 `gh-pages` 分支（一次性手动配置）

---

## 关键文件路径
```
AniMusePage/
├── index.html                    ← 入口，含两个按钮
├── vite.config.js                ← 设置 base: '/AniMusePage/'
├── src/
│   ├── main.js                   ← Three.js 场景主文件
│   ├── scene/
│   │   ├── museum.js             ← 展台、地板、灯光
│   │   ├── loader.js             ← GLB 加载（含 MeshoptDecoder）
│   │   └── postprocessing.js     ← Bloom + Vignette
│   └── interaction/
│       └── controls.js           ← 按钮事件、动画状态机
├── public/
│   └── models/
│       ├── bones.glb             ← 骨骼动画（1.7MB，进 git）
│       └── pred.glb              ← 压缩后网格动画（7.3MB，进 git）
├── package.json
└── .gitignore                    ← 排除 data/viz/gt/ 和 data/viz/pred/（各128MB）
```

---

## 分步计划

### Step 1：环境初始化
**操作（我来执行）：**
- 创建 `package.json`、`.gitignore`、`vite.config.js`（含 base 配置）、`index.html`、`src/main.js`
- `npm install three vite gh-pages`（gh-pages 用于部署，其余本地安装）
- 复制压缩好的 GLB 文件到 `public/models/`

**你如何 verify：**
```bash
npm run dev
```
浏览器打开 `http://localhost:5173`，看到黑色页面即成功。控制台无报错。

**deploy verify（可选，后续再做）：**
```bash
npm run build && npm run deploy
```
GitHub Pages URL 能访问（Settings 里配置后约等几分钟生效）。

---

### Step 2：Three.js 基础场景
**操作：** Three.js 场景、透视相机、WebGL 渲染器、OrbitControls（鼠标拖拽旋转）。

**你如何 verify：**
深色背景，鼠标拖拽可以旋转视角（虽然目前什么都没有），控制台无报错。

---

### Step 3：博物馆场景搭建
**操作：**
- 大理石地板：`PlaneGeometry` + `MeshStandardMaterial`（灰色，metalness/roughness 调出石材感）
- 展台：圆柱体底座 + 顶部平台
- 聚光灯：`SpotLight` 从斜上方打下，开启 `castShadow`
- 氛围光：蓝紫色 `HemisphereLight` + 极弱环境光
- 薄雾：`scene.fog = new THREE.FogExp2()`

**你如何 verify：**
页面出现一个有阴影的展台，灯光有明显戏剧感（展台亮，背景暗）。旋转视角可以看到地板反光。

---

### Step 4：加载 GLB 模型
**操作：**
- 用 `GLTFLoader` + `MeshoptDecoder` 加载 `bones.glb` 和 `pred.glb`
- 两个模型定位在展台上方，初始状态动画暂停在第 0 帧
- `bones.glb` 初始隐藏（`visible = false`），`pred.glb` 初始显示

**你如何 verify：**
展台上出现静止的土豚。旋转视角可以查看。控制台打印 "bones loaded" 和 "pred loaded"。

---

### Step 5：材质替换（视觉质量提升）
**操作：**
- pred 模型：替换为 `MeshStandardMaterial`，颜色 `#c8a882`，roughness 0.85（皮肤质感）
- bones 模型：替换为橙色自发光材质

**你如何 verify：**
土豚有皮肤质感，聚光灯打在身上有高光和阴影。

---

### Step 6：「Bring to Life」魔法交互
**操作：**
- EffectComposer + UnrealBloomPass
- 点击按钮：CSS 全屏白色闪光 + Bloom 强度脉冲 + 动画开始播放 + 场景灯光增强

**你如何 verify：**
点击后：① 屏幕白色闪光 ② 土豚开始动 ③ 场景变亮，有戏剧感。

---

### Step 7：骨骼/网格切换 Toggle
**操作：**
- Toggle 按钮切换 bones/pred 可见性，0.3s 淡入淡出
- 两个模型 AnimationMixer 同步播放进度

**你如何 verify：**
Toggle 后平滑切换骨骼（橙色线框）和网格（棕色土豚），动画不中断。

---

### Step 8：整体 Polish + 部署
**操作：**
- Vignette 后处理（电影感四角压暗）
- 相机默认视角调优
- 博物馆风格按钮样式
- 展台铭牌「AARDVARK」
- `npm run build && npm run deploy` 推到 GitHub Pages

**你如何 verify：**
公网 URL `https://<你的username>.github.io/AniMusePage/` 能访问，效果与本地一致。

---

## 风险点
| 风险 | 应对 |
|---|---|
| GitHub Pages base 路径错误导致资源 404 | vite.config.js 设置 `base: '/AniMusePage/'` |
| GLB 文件 >50MB 被 GitHub 拒绝 | 压缩后 pred.glb 7.3MB、bones.glb 1.7MB，均在限制内 |
| bones.glb 骨骼是独立 mesh（不是 SkinnedMesh） | Step 4 时检查节点结构，调整 AnimationMixer 绑定 |
| pred.glb morph targets 与 bones 动画时长不一致 | Step 7 时归一化播放进度 |
