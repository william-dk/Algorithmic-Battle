# 原型模拟器

`gen.js` 是为了出概念图而写的一次性脚本：用最简单的方式实现了第一级和第二级的规则、11 种经典算法、循环赛，以及把结果画成图片。

它是参考实现，不是正式引擎。写法很朴素（第二级的示例 AI 每次全图扫描），没有测试，结构也没有按正式架构来分。正式实现时对照它验证结果即可，不要直接搬用。

## 运行

需要 Node.js，没有其他依赖。

```bash
node gen.js 2d 3d thumb tour l2 duel
```

可以只跑其中几项。不带参数时跑除 `spin` 以外的全部。

| 参数 | 做什么 | 输出 |
|---|---|---|
| `2d` | 三组不同阵容的 2D 四方对局，各取中盘一帧 | `map2d_*.png`、`map_empty.png` |
| `3d` | 三组不同阵容的 3D 四方对局，各取一帧和一层切片 | `map3d_*.png`、`slice3d_*.png` |
| `thumb` | 11 种算法各自的生长形状缩略图 | `th_*.png` |
| `tour` | 11 种算法的两两循环赛，共 3,300 局 | 只有统计数据 |
| `l2` | 第二级四方对局，取若干时刻 | `mapl2_*.png` |
| `duel` | 第二级双人对局 | `duel_*.png` |
| `spin` | 3D 对局的 24 个旋转视角，必须显式指定 | `spin_*.png`、`spin_sheet.png` |

图片和统计数据都写到 `out/`。每次运行的统计数据存为 `out/stats_<参数>.json`。

## `out/` 里现有的文件

是 2026-11-15 至 11-16 几次运行留下的全部输出，包括没有被概念图采用的备选画面。

概念图实际用到的：`map2d_D.png`、`map3d_V1.png`、`slice3d_V1.png`、`mapl2_555.png`、`duel_150.png`、`map_empty.png`、全部 `th_*.png` 和 `spin_*.png`。

`out/` 里个别图片是脚本早期版本生成的（例如 `map2d_A.png`、`map2d_B.png`、`map3d.png`），现在的脚本不会再生成同名文件。

## 规则和数据

- 规则与算法定义：[`../../docs/02-rules-and-algorithms.md`](../../docs/02-rules-and-algorithms.md)
- 跑出的数据和结论：[`../../docs/05-prototype-findings.md`](../../docs/05-prototype-findings.md)

脚本里的 `l2` 场景目前只在 tick 450、540、555、570、600 取样，`duel` 在 150 到 1,600 之间取若干帧；要看别的时刻，改脚本里的 `snaps` 数组。
