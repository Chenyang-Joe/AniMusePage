# AniMusePage — Progress Log

Updated: 2026-03-24

---

## Overview

从单展品 demo 扩展为 14 个动物展品的旋转博物馆。Camera fly-to 替代了 carousel 旋转，每个展品独立管理状态。

Live URL: **https://chenyang-joe.github.io/AniMusePage/**

---

## Architecture

```
src/
├── main.js                       ← 入口：renderer, scene, camera, orbit, render loop
├── scene/
│   ├── museum.js                 ← 展台 buildPedestal(), 场景 buildMuseum()
│   ├── carousel.js               ← 14 展台布局在圆上 (N=14, R=12)
│   ├── carousel-camera.js        ← CarouselCamera: 飞行到各展位的摄像机控制
│   ├── exhibit-manager.js        ← ExhibitManager: 懒加载/卸载, 每展品状态管理
│   ├── loader.js                 ← loadExhibit(), computePedestalTransform(), 材质
│   └── postprocessing.js         ← UnrealBloomPass + VignetteShader
├── interaction/
│   └── controls.js               ← 导航/alive/mesh-bones toggle, 灯光动画
├── effects/
│   └── sparkle.js                ← SparkleEffect (alive 时的粒子效果)
└── utils/
    └── debug.js                  ← Debug.log() 日志系统
```

---

## Carousel System

### 布局数学

```
carouselGroup.position = (0, 0, R)        // R=12, 圆心在 (0,0,12)
slot[i].position (local) = (R·sin(i·2π/N), 0, −R·cos(i·2π/N))
slot[i].rotation.y = −angle               // 反旋使每个 slot 面朝圆内

slot[i] world position = (R·sin(θ), 0, R − R·cos(θ))
```

### CarouselCamera (替代 carousel 旋转)

Camera 飞行到各展位的内侧观察点，解决了旋转 carousel 时地板/房间也跟着转的问题。

```js
viewForSlot(i) {
  const θ = i * 2π / N
  camPos = (R/2·sin(θ), 3.5, R − R/2·cos(θ))    // 半径处，偏高
  target = (R·sin(θ),   2.0, R − R·cos(θ))       // slot 世界坐标
}
flyTo(index, onComplete)     // 禁用 orbit, ease-in-out 插值
update(delta)                // 每帧推进, 完成后恢复 orbit
```

### 灯光方向

灯光用 inward/lateral 基向量表达偏移，在任意 carousel 位置都正确：

```
inward  = (−sinθ, cosθ)     // 朝圆心方向（摄像机侧）
lateral = (cosθ,  sinθ)     // 垂直于 inward

spotKey:   slot + inward×3 + lateral×2,  y=7
spotRim:   slot − inward×4 − lateral×3,  y=5
pointFill: slot + inward×2 − lateral×3,  y=3
```

---

## Exhibit Manager

- **懒加载**: 激活展品 i 时加载 i, 预加载 i±2, 卸载距离≥5 的展品
- **LRU 缓存**: 最多 5 个同时加载
- **每展品状态**: `{ status, alive, showingBones, predModel, bonesModel, ...mixers, ...floorParams }`
- **Floor tracker**: per-exhibit 参数, `getFloorTracker()` 返回对应展品的更新函数

---

## computePedestalTransform — 关键修复

### 坐标空间 (parent-local space)

`model.position` 在 parent local space 中。每个 slotGroup 有 `rotation.y = −angle`，world ≠ local。
顶点必须变换到 parent local space 来计算 bounding box：

```js
const invParent = new Matrix4().copy(model.parent.matrixWorld).invert()
const base = new Matrix4().multiplyMatrices(invParent, predMeshNode.matrixWorld)
```

### 旋转居中修复

模型旋转 15° (`MODEL_ROTATION_Y = -π×15/180`)。bounding box 需要在旋转后空间计算，
否则不对称模型旋转后偏移展台中心：

```js
const R_display = new Matrix4().makeRotationY(MODEL_ROTATION_Y)
meshToParentLocal = R_display × base    // 在旋转后空间算 bounding box
```

### 体积缩放

用 bounding box 体积的立方根做 cap，对细长动物（如鳄鱼）不会过度压缩：

```js
const tentativeScale = BASE_HEIGHT / parentSizeY    // 1.5 / parentSizeY
const cbrtVol = Math.cbrt(sizeX * parentSizeY * sizeZ)
const scale = Math.min(tentativeScale, MAX_VOL_CBRT / cbrtVol)   // MAX_VOL_CBRT = 2.0
```

### 关键参数

```
BASE_HEIGHT  = 1.5           // 目标高度
MAX_VOL_CBRT = 2.0           // 体积立方根上限
MODEL_ROTATION_Y = -15°      // 顺时针 15°
pedestal top = y 1.6         // 模型底面对齐的高度
floorScaleY  = scale × parentSizeY / localSizeY
```

---

## 展台形状 (当前)

经典博物馆分层展台, 从下到上：

| 部件 | 半径 | 高度 | 说明 |
|---|---|---|---|
| 底脚 (footing) | 1.35 | 0.07 | 最宽, 接地 |
| 下颈 (lower collar) | 0.70 | 0.07 | 柱身 0.62 稍大的过渡 |
| 柱身 (shaft) | 0.62 | 1.32 | 主体 |
| 上颈 (upper collar) | 0.70 | 0.07 | 对称过渡 |
| 顶盖 (top cap) | 1.25 | 0.07 | 展示面, top=1.60 |

无铭牌, 无装饰环。材质: 暖灰石 `#d0ccc4`, roughness 0.5。

---

## 模型材质 (当前)

| 对象 | 颜色 | 材质 | 参数 |
|---|---|---|---|
| Pred mesh | `#d4cec8` 暖石膏灰 | MeshStandardMaterial | roughness 0.6, metalness 0 |
| Bones | `#f8f2e0` 亮象牙白 | MeshStandardMaterial | roughness 0.25, metalness 0.05, 实体不透明 |

---

## 场景环境 (当前: 明亮白色画廊)

- **背景/雾**: `#e0dcd6` 暖米白, FogExp2 density 0.012
- **地板**: `#d4d0c8`, roughness 0.4, metalness 0.15
- **墙壁**: 八角形, `#eae6e0`, apothem D=38
- **天花板**: `#f0ece7`, y=10
- **灯光**: ambient 0.7 + hemi 0.6 + 8 ceiling PointLights + spotKey 2.2 + spotRim 0.5 + fill 0.3

---

## Git Branches

| 分支 | 说明 |
|---|---|
| `main` | 当前工作版本: 明亮白色画廊, 暖石膏灰模型 |
| `dark-theme` | 暗色自然科学纪录片风格: 深绿背景, 青绿发光模型, 黑曜石台子, 生物荧光墙壁 |

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

Aardvark Female 已删除 (模型有问题)。

---

## 已解决的关键 Bug

1. **非首展品位置偏移**: `updateMatrixWorld(true)` 只向下传播; 改用 `updateWorldMatrix(true, true)` 向上遍历到根
2. **展品不在展台上**: 偏移量在 world space 计算但作为 parent local position 应用; 改为 parent local space 计算 bounding box
3. **远侧展品背光**: 灯光偏移硬编码只对 slot 0 正确; 改为 inward/lateral 基向量
4. **旋转后居中偏移**: bounding box 在 rotation=0 时计算, 但旋转后非对称模型偏移; 改为 meshToParentLocal 预乘旋转矩阵
5. **细长动物过度压缩**: max-axis cap 对鳄鱼等过于激进; 改为体积立方根 cap

---

## 美术方向探索

尝试过的风格:
1. **明亮白色画廊** (当前) — MoMA / Natural History Museum 风格
2. **暗色自然科学纪录片** (dark-theme 分支) — 深绿背景, 青绿发光模型, 生物荧光装饰
3. **陶土暖棕模型** — 用过 `#c8a87a`, 效果太"土", 已回滚

尝试过的装饰:
- 金色/青绿发光环 (Torus) — 已移除, 和整体风格不搭
- 墙壁高窗 + 腰线装饰条 — 效果不好, 已移除
- 地板大理石方砖纹理 (canvas texture) — 效果不好, 已移除
- 铭牌 (canvas texture on brass plate) — 已移除, 追求简洁

---

## 待做

- [ ] 墙壁/地板装饰 (需要更好的方案)
- [ ] 展品模型和环境的视觉区分 (当前石膏灰还行但可优化)
- [ ] 更多美术 polish
- [ ] 部署到 GitHub Pages
