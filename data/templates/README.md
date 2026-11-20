# 名单导入模板

## 必填列

| 列（中文） | 列（英文） | 说明 |
|------------|------------|------|
| 工号 | emp_no | 本活动内唯一，重复导入会更新姓名/部门 |
| 姓名 | name | 必填 |
| 部门 | department | 可选，可留空 |

表头任选**中文**或**英文**一套即可，不要混用两套用不同列名（同一文件内列名需一致）。

## 文件

| 文件 | 说明 |
|------|------|
| [participants-import-template.csv](participants-import-template.csv) | 中文表头 CSV（UTF-8，可用 Excel 打开） |
| [participants-import-template-en.csv](participants-import-template-en.csv) | 英文表头 CSV |
| [participants-import-template.xlsx](participants-import-template.xlsx) | Excel 模板（含示例行） |

## 使用步骤

1. 复制模板，删除或覆盖示例行，填入本公司名单  
2. 管理台 → **名单** → **导入 CSV / Excel**  
3. 导入后检查顶部「可参与 / 在册」人数  

## 注意

- CSV 建议 **UTF-8** 保存（Excel「另存为 CSV UTF-8」）  
- 工号重复时以**最后一次导入**的姓名、部门为准  
- 空行会自动跳过  