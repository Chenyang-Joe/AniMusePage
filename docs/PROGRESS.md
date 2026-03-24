# AniMusePage — Progress Log

Updated: 2026-03-24

---

## Overview

Paper project page for AniMuse: "Night at the Museum — A Scalable Framework for Text-Driven Mesh Motion Generation". 14 个动物展品的旋转博物馆，包含 landing → demo → abstract 三页流程。

Live URLs:
- **https://chenyang-joe.github.io/AniMusePage/**
- **https://ai4ce.github.io/AniMuse/**

---

## Page Flow

```
Landing (overhead camera)
  ↓ scroll/swipe down
  ↓ overhead → slot 0 → active exhibit (two-phase fly)
Demo (exhibit view, orbit camera)
  ↑ "Back to Overview" → active exhibit → slot 0 → overhead (two-phase fly)
  → "Abstract & Paper Info" → abstract overlay
Abstract (dark overlay on demo)
  → "Back to Demo" → returns to demo
```

### Camera Transitions
- **Landing → Demo**: overhead → slot 0 (直线下降) → 旋转到上次的 activeIndex
- **Demo → Landing**: 当前展台 → slot 0 (旋转) → overhead (直线上升)
- 两阶段设计保证 slot 0 和 overhead 在同一垂直线上，过渡平滑

---

## Architecture

```
src/
├── main.js                       ← 入口：renderer, scene, camera, orbit, render loop
├── scene/
│   ├── museum.js                 ← 展台 buildPedestal(), 场景 buildMuseum()
│   ├── carousel.js               ← 14 展台布局在圆上 (N=14, R=12)
│   ├── carousel-camera.js        ← CarouselCamera: 飞行到各展位的摄像机控制
│   ├── exhibit-manager.js        ← ExhibitManager: 全量预加载, 每展品状态管理
│   ├── loader.js                 ← loadExhibit(), computePedestalTransform(), 材质
│   └── postprocessing.js         ← UnrealBloomPass + VignetteShader
├── interaction/
│   ├── page-manager.js           ← PageManager: landing/demo/abstract 状态机, 摄像机飞行
│   └── controls.js               ← 导航/alive/mesh-bones toggle, 灯光动画, orbit camera
├── effects/
│   └── sparkle.js                ← SparkleEffect (alive 时的粒子效果)
└── utils/
    └── debug.js                  ← Debug.log() 日志系统
```

---

## PageManager 状态机

```
states: 'landing' | 'flying' | 'demo'

landing  ──scroll/swipe──→  flying  ──arrive──→  demo
demo     ──Back to Overview──→  flying  ──arrive──→  landing
demo     ──Abstract──→  abstract overlay (state stays 'demo')
```

### UI 元素显隐

| State | landing-page | controls | exhibit-info | btn-back/abstract | abstract-page |
|-------|-------------|----------|--------------|-------------------|---------------|
| landing | visible | hidden | hidden | hidden | hidden |
| demo | hidden | visible | visible | visible | hidden |
| abstract | hidden | hidden | hidden | hidden | visible |

---

## Exhibit Manager

- **全量预加载**: `loadAll()` 启动时加载全部 14 个展品，loading bar 反映进度
- **每展品状态**: `{ status, alive, showingBones, predModel, bonesModel, ...mixers, ...floorParams }`
- **Floor tracker**: per-exhibit 参数, `getFloorTracker()` 返回对应展品的更新函数

---

## Carousel System

### 布局数学

```
carouselGroup.position = (0, 0, R)        // R=12, 圆心在 (0,0,12)
slot[i].position (local) = (R·sin(i·2π/N), 0, −R·cos(i·2π/N))
slot[i].rotation.y = −angle               // 反旋使每个 slot 面朝圆内

slot[i] world position = (R·sin(θ), 0, R − R·cos(θ))
```

### CarouselCamera

```js
viewForSlot(i) {
  const θ = i * 2π / N
  camPos = (R/2·sin(θ), 3.5, R − R/2·cos(θ))    // 半径处，偏高
  target = (R·sin(θ),   2.0, R − R·cos(θ))       // slot 世界坐标
}
```

### OrbitControls
- rotate: enabled (用户可拖动旋转视角)
- zoom: enabled
- pan: disabled
- 飞行中 disabled，到达后 re-enable

---

## UI 设计

### 字体
- **标题/动物名**: Cormorant Garamond (艺术衬线体, Google Fonts)
- **正文/按钮/UI**: Noto Sans / system-ui (专业无衬线)

### 配色
- **场景背景/fog**: `#e2e0de` 微暖灰 (博物馆质感)
- **UI 文字**: 纯黑灰阶 `rgba(0,0,0,...)`, 无暖色调
- **Night mode 文字**: 纯白 `rgba(255,255,255,...)`
- **按钮**: 毛玻璃风格 `rgba(255,255,255,0.55)` + `backdrop-filter: blur(10px)`
- **Abstract 页**: 纯黑遮罩 `rgba(0,0,0,0.85)` + 白色文字

### 尺寸 (桌面)
- 左上角 species/action: 62px
- 右上角按钮: 280px 宽, 14px 字
- Bring to Life: 300px 宽, 15px 字
- 导航箭头: 54px
- Landing 标题: 80px

### 移动端 (max-width: 768px)
- 左上角: species/action 34px, max-width 50vw (不遮挡右侧)
- 右上角按钮: auto 宽度, 11px 字
- 底部控件: 按比例缩小

---

## computePedestalTransform

### 坐标空间 (parent-local space)

顶点变换到 parent local space 计算 bounding box：

```js
const invParent = new Matrix4().copy(model.parent.matrixWorld).invert()
const base = new Matrix4().multiplyMatrices(invParent, predMeshNode.matrixWorld)
```

### 旋转居中修复

```js
const R_display = new Matrix4().makeRotationY(MODEL_ROTATION_Y)   // -15°
meshToParentLocal = R_display × base    // 在旋转后空间算 bounding box
```

### 体积缩放

```
BASE_HEIGHT  = 1.5           // 目标高度
MAX_VOL_CBRT = 2.0           // 体积立方根上限
MODEL_ROTATION_Y = -15°      // 顺时针 15°
pedestal top = y 1.6
```

---

## 展台形状

经典博物馆 Bezier lathe 展台。材质: 暖灰石 `#d0ccc4`, roughness 0.5。

---

## 模型材质

| 对象 | 颜色 | 材质 | 参数 |
|---|---|---|---|
| Pred mesh | `#d4cec8` 暖石膏灰 | MeshStandardMaterial | roughness 0.6, metalness 0 |
| Bones | 同色系半透明 | MeshStandardMaterial | roughness 0.25, metalness 0.05 |

---

## 场景环境

- **背景/雾**: `#e2e0de` 微暖灰, FogExp2 density 0.012
- **地板**: `#d4d0c8`, roughness 0.4, metalness 0.15
- **墙壁**: 八角形, `#eae6e0`, apothem D=38
- **天花板**: `#f0ece7`, y=10
- **灯光**: ambient 0.7 + hemi 0.6 + 8 ceiling PointLights + spotKey + spotRim + fill

---

## 部署

| 命令 | 目标 |
|---|---|
| `npm run deploy` | Chenyang-Joe/AniMusePage (base: /AniMusePage/) |
| `npm run deploy:ai4ce` | ai4ce/AniMuse (自动切换 base: /AniMuse/, 部署后恢复) |

---

## 14 个展品

| Index | Animal | Action |
|---|---|---|
| 0 | Arctic Wolf Female | swimturnr000 |
| 1 | Bactrian Camel Juvenile | walktorun |
| 2 | Bairds Tapir Female | fighttaunt |
| 3 | Blackbuck Female | shake |
| 4 | Bush Dog Female | runbaseonspot |
| 5 | Gharial Juvenile | standtowalk |
| 6 | Gray Wolf Female | runbase |
| 7 | Hill Radnor Sheep Juvenile | drinktostand |
| 8 | Japanese Raccoon Dog Male | deepswim03 |
| 9 | Little Penguin Juvenile | interactadultb |
| 10 | Quokka Female | eatloop01 |
| 11 | Red Ruffed Lemur Female | climbjumpout |
| 12 | Rednecked Wallaby Juvenile | standtowalk |
| 13 | Standard Donkey Juvenile | fighttaunt |

---

## 已解决的关键 Bug

1. **非首展品位置偏移**: `updateWorldMatrix(true, true)` 向上遍历到根
2. **展品不在展台上**: parent local space 计算 bounding box
3. **远侧展品背光**: inward/lateral 基向量表达灯光偏移
4. **旋转后居中偏移**: meshToParentLocal 预乘旋转矩阵
5. **细长动物过度压缩**: 体积立方根 cap
6. **Landing page 拦截 pointer 事件**: `.landing-content` 的 `pointer-events: auto` 覆盖了父元素的 `none`
7. **flyToLanding camera 瞬移**: resetCamera 和 pageManager 飞行冲突，去掉重复 reset
