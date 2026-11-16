# 设计图

六个界面的概念图，有三种形式。

| 位置 | 是什么 | 怎么看 |
|---|---|---|
| `screens/*.png` | 截图，1440 宽，2 倍分辨率 | 直接打开 |
| `mockups/*.html` | 网页版，界面之间能跳转，3D 可以转 | 双击 `mockups/setup.html` |
| `canvas/` | 线上设计画布的源文件 | 见下文 |

各界面的说明见 [`../docs/04-frontend.md`](../docs/04-frontend.md)。

## 六个界面

| 界面 | 截图 | 网页版 | 画布源文件 |
|---|---|---|---|
| 对局设置与算法库 | `screens/01-setup.png` | `mockups/setup.html` | `canvas/Setup.dc.html` |
| 2D 观战 | `screens/02-watch-2d.png` | `mockups/watch-2d.html` | `canvas/Main.dc.html` |
| 3D 观战 | `screens/03-watch-3d.png` | `mockups/watch-3d.html` | `canvas/Arena3D.dc.html` |
| 批量对战与排行 | `screens/04-tournament.png` | `mockups/tournament.html` | `canvas/Tournament.dc.html` |
| 第二级 · 攻伐观战 | `screens/05-battle.png` | `mockups/battle.html` | `canvas/Battle.dc.html` |
| AI 工坊 | `screens/06-workshop.png` | `mockups/workshop.html` | `canvas/Workshop.dc.html` |

## 线上画布

https://claude.ai/artifact/VyV3fsMxy72tWcajLas5R9 （私有，仅本人可见；要给别人看需要在页面的分享菜单里开放）

`canvas/` 里是它在 2026-11-16 的源文件备份。`.dc.html` 是设计画布专用的格式，脱离画布无法直接打开，所以另外生成了 `mockups/` 里的普通网页。

如果之后在线上画布里改了设计，本地这份不会自动更新。

## 重新生成

改了 `canvas/*.dc.html` 之后，重新生成网页版：

```bash
node build-mockups.js
```

截图是用无界面的 Edge 对网页版拍的，窗口 1440 × 940（第二阶段的两个界面是 1440 × 1040），2 倍缩放。

## 素材

`mockups/assets/` 里的地图、体素图和缩略图都由原型模拟器生成，见 [`../prototype/sim/`](../prototype/sim/README.md)。其中 `spin_00.png` 到 `spin_23.png` 是 3D 对局每隔 15° 的 24 个视角，用来模拟旋转。
