# 平安银行回单/月结单/交易明细下载器

Tampermonkey 油猴脚本，自动下载平安银行电子回单、月结单、交易明细。

## 功能

| 功能 | 说明 |
|------|------|
| 电子回单 | 按月批量下载 PDF |
| 月结单 | 按月下载 PDF |
| 交易明细 | 支持单月/季度下载 Excel |

## 支持公司

| 简称 | 公司名称 | 账号 | 快捷键 |
|------|----------|------|--------|
| wj | 深圳市福田区赛格电子市场网聚商行 | 11006712353201 | W |
| bf | 爆发科技有限公司 | 15675102120011 | B |
| hff | 昊峰坊(深圳)贸易有限公司 | 11014705692006 | H |

> 公司配置在代码开头 `COMPANIES` 对象中，添加新公司后快捷键自动生成（取首字母大写）。

## 文件命名规则

- 回单: `{year}_{month}_dzhd_{company}_{batch}.pdf`
- 月结单: `{year}_{month}_yjd_{company}.pdf`
- 交易明细: `{year}_{month}_jymx_{company}.xlsx` 或 `{year}_Q{quarter}_jymx_{company}.xlsx`

## 安装

1. 安装 [Tampermonkey](https://tampermonkey.net/) 扩展
2. 新建脚本，粘贴 `pinganBank_download_tool.js` 内容
3. 保存
4. 访问 [平安银行企业网银](https://e.orangebank.com.cn/)

## 快捷键

> 快捷键仅在橙银行页面内有效。

| 按键 | 功能 |
|------|------|
| `F1` / `F2` / `F3` | 切换回单 / 月结单 / 明细标签 |
| `1-9` / `0` | 选择月份（1月~12月） |
| `Q` + `1`~`4` | 选择季度（Q1~Q4） |
| `A` | 全选12个月 |
| `C` | 清空选择 |
| `W` / `B` / `H` | 切换公司（网聚/爆发/昊峰坊） |
| `Enter` | 开始下载 |

## 使用

1. 选择公司（下拉框或快捷键）
2. 选择标签页（点击或 F1/F2/F3）
3. 选择年份（默认当年）
4. 选择月份（点击按钮或用快捷键）
5. 按 Enter 或点击按钮下载

## 界面预览

```
┌─────────────────────────────┐
│ 公司: [网聚 ▾]             │
│ ─────────────────────────  │
│ [回单] [月结单] [明细]     │
│ 年份: [2025 ▾]             │
│ [1] [2] [3] [4] [5] [6]    │
│ [7] [8] [9] [10] [11] [12] │
│                             │
│ F1-回单 F2-月结单 F3-明细   │
│ 1-9,0-月份 Q+1~4-季度       │
│ A-全选 C-清空 W-网聚        │
│ B-爆发 H-昊峰坊             │
│ [   开始下载 (Enter)   ]    │
└─────────────────────────────┘
```

## 文件存储

浏览器下载目录（需手动移动到局域网共享文件夹）：

```
下载目录/
├── 2025_01_dzhd_wj_1.pdf     # 回单
├── 2025_01_yjd_wj.pdf        # 月结单
├── 2025_Q1_jymx_wj.xlsx      # 交易明细（季度）
└── 2025_03_jymx_wj.xlsx      # 交易明细（单月）
```

## 技术栈

- Tampermonkey
- GM_xmlhttpRequest

## 添加新公司

在代码 `COMPANIES` 对象中添加一行即可，快捷键自动生成：

```javascript
const COMPANIES = {
    'wj':  { name: '网聚',     accountNo: 'xxx', accountName: '...', accountBankName: '' },
    'bf':  { name: '爆发',     accountNo: 'xxx', accountName: '...', accountBankName: '' },
    'hff': { name: '昊峰坊',   accountNo: 'xxx', accountName: '...', accountBankName: '' },
    'new': { name: '新公司',   accountNo: 'xxx', accountName: '...', accountBankName: '' }  // 快捷键自动为 N
};
```
