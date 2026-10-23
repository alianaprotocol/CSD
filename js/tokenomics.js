/* ==========================================================================
   财神DAO · 代币经济方案 — 主脚本
   I18N 字典 + 全部交互逻辑
   ========================================================================== */

/* ================= 语言字典 ================= */
var I18N = {
  zh: {
    'page.title': '财神DAO · 代币经济方案',
    'mast.eb.cn': '代币经济文档',
    'mast.eb.en': 'Tokenomics Blueprint',
    'mast.sub': '代币经济蓝图 · 驱动长期价值的通缩生态',
    'mast.standard.k': '代币标准',
    'mast.inflation.k': '增发权限',
    'mast.inflation.v': 'Null（永不增发）',
    'mast.status.k': '上线状态',
    'mast.status.v': 'TGE 筹备中',

    'toc.highlights': '核心优势',
    'toc.overview': '基础信息',
    'toc.distribution': '代币分配',
    'toc.vesting': '解锁节奏',
    'toc.burn': '通缩机制',
    'toc.execution': '执行规则',
    'toc.risks': '风险声明',
    'toc.faq': 'FAQ',

    'abstract.p1': '全网仅发行 <b>686,868,686</b> 枚 $财神DAO，总量恒定、不再增发。其中 <span class="hl">41.68%</span> 划入「FDV 里程碑销毁池」——币价每上一个台阶，即触发一档销毁，转入黑洞地址<span class="hl">永久退出流通</span>，累计销毁上限 286,291,150 枚，且永不回流团队。剩余 58.32% 按基金会、社区、生态、流动性、运营与战略储备分项配置，多数份额设 3 至 36 个月不等的锁仓与线性释放；流动性类份额采用 TGE 先释放、余量线性释放的方式，每一笔锁仓均有独立链上地址可供查验。',

    'hl.title': '核心优势',
    'hl.1.t': '供应量用于销毁',
    'hl.1.d': '12 档 FDV 里程碑，累计销毁上限 286,291,150 枚，永不回流团队',
    'hl.2.t': '锁仓链上可查',
    'hl.2.d': '基金会、社区、生态份额均有独立 Jupiter Lock 托管地址，第三方可随时验证',
    'hl.3.t': '多签 + 多源预言机',
    'hl.3.d': 'Squads 5/7 多签执行，CoinGecko、CMC、链上预言机多源取中位数，杜绝单点操纵',
    'hl.4.unit': '个月',
    'hl.4.t': '解锁曲线平缓',
    'hl.4.d': '无一次性大额解锁，最长份额拉至 39 个月释放，不形成集中抛压',
    'hl.5.t': '总量恒定，永不增发',
    'hl.5.d': '一经铸出即封顶，无任何增发权限，通缩路径写死在链上',
    'hl.5.link': '查看链上铸造交易',

    'ov.title': '基础信息',
    'ov.name.k': '名称 | Name',
    'ov.name.v': '财神到 God Of Fortune',
    'ov.symbol.k': '符号 | Symbol',
    'ov.symbol.v': '$财神DAO',
    'ov.network.k': '公链 | Network',
    'ov.network.v': 'Solana SPL',
    'ov.supply.k': '发行量 | Total Supply',
    'ov.tge.k': 'TGE | Token Generation Event',
    'ov.tge.v': '待定 · 以官方公告为准',
    'ov.ca.k': '合约地址 | CA',
    'ov.features.k': '核心特性 | Features',
    'ov.features.v': '总量恒定不增发 · 41.68% 供应量用于销毁 · 全部分配额链上可查',

    'dist.title': '代币分配',
    'donut.center': '总供应量',
    'lg.0': 'FDV 里程碑销毁池',
    'lg.1': '财神基金会',
    'lg.2': 'BG 基金会',
    'lg.3': '燃香赐福池',
    'lg.4': '做市 / CEX / DEX',
    'lg.5': 'LUCKY99 社区',
    'lg.6': 'FIST 社区',
    'lg.7': 'CY2000 社区',
    'lg.8': '财神生态建设',
    'lg.9': '初始流动性',
    'lg.10': '空投奖励 / 营销',
    'lg.11': '运营',
    'lg.12': '战略储备',
    'unit.token': '枚',
    'vest.lock': '锁仓',
    'vest.release': '释放',
    'vest.none': '无',
    'vest.by.milestone': '按里程碑销毁',
    'vest.3m': '3 个月',
    'vest.36m.linear': '36 个月线性',
    'vest.12m.linear': '12 个月线性',
    'vest.18m.linear': '18 个月线性',
    'vest.open.inject': '开盘注入',
    'alloc.0.note': '多签 5/7 执行，价格每达一档目标即转入黑洞永久销毁，累计 286,291,150 枚，永不回流团队',
    'alloc.1.note': '三年匀速解锁，与项目长期价值深度绑定',
    'alloc.2.note': '三年匀速解锁，与项目长期价值深度绑定',
    'alloc.3.note': 'TGE 释放 5%（约 2,511,200 枚），其余 95% 于 12 个月内线性释放；定向回馈真实参与的用户',
    'alloc.4.note': 'TGE 释放 10%（约 4,121,212 枚），剩余 90% 于 12 个月内线性释放；先建立交易深度，再逐步释放',
    'alloc.5.note': '社区份额长期匀速解锁，不形成集中抛压',
    'alloc.6.note': '社区份额长期匀速解锁，不形成集中抛压',
    'alloc.7.note': '新增生态伙伴份额，TGE 不释放、无锁仓期，自 TGE 起 36 个月匀速线性释放，长期协同',
    'alloc.8.note': 'TGE 释放 10%（约 3,500,000 枚），其余 90% 于 18 个月内线性释放；按建设节奏分批投入',
    'alloc.9.note': '建立 Meteora DLMM 流动池，开盘即有真实可交易深度',
    'alloc.10.note': 'TGE 释放 10%（约 1,373,737 枚），剩余 90% 于 12 个月内线性释放；空投直达真实用户，营销细水长流',
    'alloc.11.note': 'TGE 释放 10%（约 686,869 枚），剩余 90% 于 12 个月内线性释放；保障项目日常运营与市场推广',
    'alloc.12.note': '预留给未来合作社区与特别战略伙伴，锁仓 3 个月后分 36 个月线性释放，为生态长期协同预留空间',
    'dist.caption': '<b>说明：</b>各分配项中的 <b>TGE</b> 指代币生成事件当日的即时释放比例，剩余部分按该行「释放」栏的线性周期解锁；「线性释放」指按时间均匀解锁，例如 36 个月线性释放即每月解锁该部分总量的 1/36 —— 解锁曲线平缓，不存在一次性大额解锁带来的集中抛压。TGE 与锁仓的完整定义见「03 解锁节奏」末尾的名词解释。',

    'vest.title': '解锁节奏',
    'tl.1.when': 'TGE · 0 月', 'tl.1.what': '≈ 32.2M 枚', 'tl.1.why': '初始流通 4.69%',
    'tl.2.when': '第 3 个月', 'tl.2.what': '+233.5M 枚', 'tl.2.why': '基金会 / 社区 / 战略储备解锁',
    'tl.2.what2': '+233.5M 枚 开始线性', 'tl.2.why2': '基金会 / 社区 / 战略储备份额解锁 Cliff，进入线性释放',
    'tl.3.when': '第 12 个月', 'tl.3.what': '做市 / 空投 / 燃香 / 运营', 'tl.3.why': '12 个月线性份额释放完毕',
    'tl.3.what2': '做市 / 空投 / 燃香 / 运营完成',
    'tl.4.when': '第 18 个月', 'tl.4.what': '生态建设完成', 'tl.4.why': '18 个月线性释放完毕',
    'tl.5.when': '第 39 个月', 'tl.5.what': '全部线性份额释放完毕', 'tl.5.why': '销毁池仍锁定，按里程碑销毁', 'tl.5.why2': '销毁池仍锁定，按里程碑销毁，不随时间线性释放',
    'tl.caption': '时间轴仅示意释放节奏，不含销毁池 —— 销毁池按里程碑销毁，不随时间线性释放。',

    'rel.1.title': '初始流动性',
    'rel.1.rule': 'TGE 全部释放',
    'rel.1.scope': '开盘注入 · 建立 Meteora DLMM 流动池，确保即时可交易深度',
    'rel.1.done': 'TGE 当日',

    'rel.2.title': '做市 / 空投 / 运营',
    'rel.2.rule': 'TGE 释放 10% · 余量 12 个月线性',
    'rel.2.scope': 'CEX/DEX 流动性 · 营销与活动 · 项目日常运营｜无锁仓期',

    'rel.3.title': '燃香赐福池',
    'rel.3.rule': 'TGE 释放 5% · 余量 12 个月线性',
    'rel.3.scope': '定向回馈真实参与的用户｜无锁仓期',

    'rel.4.title': '财神生态建设',
    'rel.4.rule': 'TGE 释放 10% · 余量 18 个月线性',
    'rel.4.scope': '按建设节奏分批投入，不做一次性释放',

    'rel.5.title': '基金会 / 社区 / 战略储备',
    'rel.5.rule': '锁仓 3 个月 · 之后 36 个月线性',
    'rel.5.scope': 'Caishen/BG 基金会 · Lucky99/Fist/CY2000 社区 · 战略储备｜拉长至 39 个月周期，长期利益与持币人一致',

    'rel.6.title': 'FDV 里程碑销毁池',
    'rel.6.rule': '不释放，仅按里程碑销毁',
    'rel.6.scope': 'FDV 达目标即转入黑洞永久销毁，永不回流团队，也不会转作他用',
    'rel.6.dest': '黑洞永久锁定',

    'rel.cliff': '锁仓', 'rel.monthly': '月均', 'rel.done': '完成', 'rel.trigger': '触发', 'rel.dest': '去向', 'rel.method': '方式',
    'rel.total.cond': '合计', 'rel.total.scope': '与总发行量一致 · 100%',
    'rel.subtotal.cond': '其中：TGE 即时释放小计', 'rel.subtotal.scope': '初始流动性 20M + 做市/空投/运营 6.18M + 燃香赐福池 2.51M + 生态建设 3.5M，约占总量的 4.69%',
    'vest.note': '<b>名词解释：</b>',
    'vest.note.1': '<b>TGE</b>（Token Generation Event，代币生成事件）——代币首次铸造并上线的时点，也是所有锁仓与释放计时的起点；',
    'vest.note.2': '<b>Cliff</b>（锁仓期）——该期间内不产生任何解锁；',
    'vest.note.3': '<b>Vesting</b>（线性释放）——锁仓期结束后按时间逐期解锁。',
    'vest.note.footer': '上述锁仓与释放安排均通过 Jupiter Lock 链上托管执行，第三方可随时自行查验，项目方无法单方面更改。',

    'burn.title': '通缩机制',
    'burn.intro': '币价上涨带动 FDV 上升，逐档触发销毁 —— 价格越高，单档销毁量越大，形成 <b>「上涨 → 通缩 → 筹码更稀缺」</b>的正向循环。12 档全部触发后，累计销毁 286,291,150 枚，占总量的 <b>41.68%</b>，且永不回流团队。销毁池独立列示，与基金会、社区份额完全隔离。',
    'burn.tbl.title': 'FDV 里程碑销毁表', 'burn.tbl.meta': '12 档 · 286,291,150 枚',
    'burn.th.1': '阶段', 'burn.th.2': 'FDV 触发', 'burn.th.3': '本档销毁', 'burn.th.4': '累计销毁', 'burn.th.5': '销毁后总供应量',
    'burn.swipe': '左右滑动查看完整数据',
    'chart.sub': '累计销毁随 FDV 上升',
    'chart.tier1': '起步区', 'chart.tier2': '成长期', 'chart.tier3': '突破期', 'chart.tier4': '成熟期',
    'kpi.1': '累计销毁上限（枚）', 'kpi.2': '占总发行量', 'kpi.3': '全部触发后剩余供应量',
    'burn.caption': '<b>FDV（完全稀释估值）</b> = 币价 × 原始总供应量 686,868,686。触发口径固定，不因流通量变化而改变。12 档目标逐级抬升，单档销毁量随之递增，全部触发后累计销毁量占总供应量的 41.68%。美元单位：M = 百万，B = 十亿。',

    'exec.title': '执行规则',
    'exec.1.v': 'FDV = 价格 × 原始总供应量 686,868,686，口径固定，不因流通量变化而改变',
    'exec.2.v': 'CoinGecko、CMC、链上预言机多源取中位数，单一数据源无法影响触发结果，从源头杜绝操纵',
    'exec.3.v': '5/7 多签执行，7 个签名方分别代表<b>财神基金会</b>（2 席）、<b>社区</b>（4 席）与<b>独立第三方</b>（1 席）。任何单一主体无法独立操作，签名地址公开于链上，可随时在 Solscan 核验。社区席位占比 4/7，5/7 的通过门槛要求任何决定必须跨方共识，团队与社区均无法单方面执行。',
    'exec.4.v': '$财神DAO 为治理代币。持币人可对以下事项发起治理提案：<br>（1）生态建设基金的用途与分配；<br>（2）销毁里程碑参数微调（档位阈值、判定窗口）；<br>（3）多签签名方的更换与增补；<br>（4）重大生态合作与资金支出。<br>治理机制将随生态成熟逐步引入，具体流程与权重另行公告。',
    'exec.5.v': 'Solana 黑洞地址，转入后永久锁定、无法找回：<br><code>1nc1nerator11111111111111111111111111111111</code>',
    'exec.6.v': '每笔销毁的交易哈希、数量、时间与执行人全部对外公开，任何人可逐笔链上核验',
    'exec.7.v': '销毁池继续锁定，不回流团队，也不会转作他用',
    'exec.8.v': '若一次性跨越多档，按顺序逐档执行，不跳过、不合并，每一档均可独立核验',

    'risk.title': '风险与声明',
    'risk.intro': '<b>重要提示：</b>数字资产投资存在重大风险，包括本金全部损失的可能。请勿投入无法承受损失的资金。本页所有数字、比例与机制安排仅用于说明项目结构，不构成任何形式的投资建议、要约或招揽。',
    'risk.1': '<b>市场风险</b> —— 数字资产价格波动剧烈，可能在短时间内大幅下跌甚至归零。本项目不承诺保本，也不承诺任何形式的收益。',
    'risk.2': '<b>流动性风险</b> —— 代币在特定阶段可能缺乏足够的交易深度；份额解锁、市场情绪或大额持有者的行为均可能造成价格冲击，部分订单可能无法按预期价格成交。',
    'risk.3': '<b>智能合约风险</b> —— SPL 代币合约、Jupiter Lock 锁仓合约、Squads 多签合约均可能存在未被发现的设计缺陷或漏洞，极端情况下可能导致资产损失或不可逆的错误。',
    'risk.4': '<b>预言机与数据源风险</b> —— 销毁触发依赖 CoinGecko、CMC、链上预言机等多个价格源。若数据源故障、被操纵或彼此产生重大分歧，可能导致触发延迟、触发争议或误触发。',
    'risk.5': '<b>执行与治理风险</b> —— 销毁、锁仓与资金调拨均依赖 5/7 多签持续运作。签名方可能失联、产生分歧、延迟执行，或在极端情况下出现恶意行为。治理机制尚在建设，投票权重与提案流程可能随时间调整。',
    'risk.6': '<b>监管风险</b> —— 各司法辖区对数字资产的定性与监管政策存在重大不确定性。代币可能被某一辖区认定为证券、商品或其他受监管资产，从而限制其流通或交易，甚至导致项目中止。',
    'risk.7': '<b>集中度风险</b> —— 在项目早期，代币持仓可能高度集中于少数地址。大额持有者的交易行为可能显著影响价格与市场深度。',
    'risk.8': '<b>运营与执行风险</b> —— 项目高度依赖团队的持续投入。人员变动、资金不足、外部环境变化均可能导致路线图延期、机制调整或阶段性中止。',
    'legal.1': '<b>地区限制：</b>本代币及本页内容不面向美国、中国大陆、受制裁国家或地区，以及任何法律禁止数字资产交易的辖区的居民。请在使用前确认您所在地的法律法规；任何因违反属地法律而产生的责任由用户自行承担。',
    'legal.2': '<b>代币性质声明：</b>$财神DAO <b>不是证券、不是股权、不是债券、不代表任何实体所有权或利润分配权</b>，也不承诺任何形式的收益、利息或回报。代币仅用于本生态内的功能访问与治理参与。',
    'legal.3': '<b>前瞻性陈述：</b>本页中使用的「将」「计划」「预期」「目标」「预计」等表述属于前瞻性陈述，基于当前假设与判断，可能因实际情况变化而不再准确。这类表述不构成承诺，实际结果可能与预期存在重大差异。',
    'legal.4': '<b>税务责任：</b>持有、交易或处置 $财神DAO 可能产生税务义务。用户应自行咨询所在地的专业税务顾问，所有因持有或交易产生的税务责任由用户自行承担。',
    'legal.disc': '<b>免责声明：</b>本页所有内容仅作信息展示用途，不构成任何投资、法律、税务或会计建议。在做出任何与 $财神DAO 相关的决定前，请自行进行充分调研并咨询持牌专业人士。',

    'faq.title': '常见问题',
    'faq.expand': '展开全部',
    'faq.collapse': '收起全部',
    'faq.1.q': 'FDV 怎么算？为什么用原始总供应量？',
    'faq.1.a': 'FDV = 币价 × 原始总供应量 <b>686,868,686</b>。用原始总量而不是流通量，是为了让触发口径固定、不随解锁而变化，避免因流通量变化导致触发标准漂移。无论销毁多少、释放多少，每一档的触发价格始终可预期。',
    'faq.2.q': '销毁后代币去哪了？能不能找回？',
    'faq.2.a': '转入 Solana 黑洞地址 <code>1nc1nerator...1111</code>，私钥不存在，全网可查、永久锁定、无法找回。每笔销毁的交易哈希、数量、时间与执行人全部对外公开，任何人可逐笔核验。',
    'faq.3.q': '如果一直没达到 $1B FDV 怎么办？',
    'faq.3.a': '销毁池继续锁定，<b>不回流团队、不转作他用</b>。已触发的档位照常销毁，未触发的部分永远不动。销毁池与团队份额完全隔离，即使项目停止运营，这部分代币也不会被团队动用。',
    'faq.4.q': '锁仓到期后会不会砸盘？',
    'faq.4.a': '释放型份额中的大部分是 <b>3 个月锁仓 + 36 个月线性</b>，每月只释放 1/36，单月释放量极小。最长的份额拉至 39 个月，不形成集中抛压。所有锁仓均通过 Jupiter Lock 链上托管，第三方可随时自行查验。',
    'faq.5.q': '团队有没有预留份额？怎么防止跑路？',
    'faq.5.a': '团队份额包含在「财神基金会」中，同样锁 3 个月 + 36 个月线性，与所有持币人利益一致。销毁池独立列示，与团队份额完全隔离，<b>永不回流团队</b>。执行销毁由 5/7 多签完成，任何单一主体无法独立操作，不存在单点控制风险。',
    'faq.6.q': '销毁触发数据会不会被操纵？',
    'faq.6.a': '数据源为 CoinGecko、CMC、链上预言机，<b>多源取中位数</b>，单一数据源无法左右结果；执行由 5/7 多签完成，任一单一主体无法独立操作。触发口径固定，不因流通量变化而改变。',
    'faq.7.q': '多签的 7 个签名方是谁？他们能不能作恶？',
    'faq.7.a': '7 个签名方分别代表财神基金会（2 席）、社区（4 席）与独立第三方（1 席）。任何单个主体都无法独立动用资金或触发销毁，需要至少 5 席同时签名。签名地址公开于链上，可随时在 Solscan 核验。社区席位 4/7，5/7 的通过门槛决定了任何决定都必须获得基金会或独立第三方的至少一票，<b>形成跨方共识才能执行</b>——既避免团队单方面控制，也防止社区多数仓促决策。未来签名方的更换与增补将纳入治理程序，签名方无法私下替换自己。',
    'faq.8.q': '持币人能参与哪些治理决策？',
    'faq.8.a': '治理范围涵盖生态建设基金用途、销毁机制参数微调、多签签名方更换、重大生态合作与资金支出四类事项。治理机制将随生态成熟逐步引入，在此之前相关事项由 5/7 多签执行并向社区公开披露；治理上线后，提案与投票的具体流程、权重与门槛将另行公告。',
    'faq.9.q': '项目接受哪些地区的用户？',
    'faq.9.a': '本代币及本页内容不面向美国、中国大陆、受制裁国家或地区，以及任何法律禁止数字资产交易的辖区的居民。请在使用前确认您所在地的法律法规。代币本身是无需许可的链上资产，但用户有责任确保自身参与行为符合属地法律。',

    'foot.channels': 'Official Channels · 官方渠道',
    'foot.ch.1': '官网',
    'foot.ch.4.url': '邀请码 RmrnJBvZ',
    'foot.ch.5.url': 'solscan.io · 链上核验',
    'foot.ch.6.url': 'lock.jup.ag · 锁仓托管',
    'foot.disc': '本文档仅用于信息展示，不构成任何投资、法律、税务或会计建议。数字资产价格波动剧烈，请理性判断、注意风险。完整风险披露请见「06 风险与声明」。文档版本 v1.7 · 最后更新 2026-10-18。',

    'toast.copy.ca': '合约地址已复制',
    'toast.copy.invite': '邀请码已复制',
    'label.theme.dark': '切换到深色模式',
    'label.theme.light': '切换到浅色模式',
    'label.lang.switch': 'Switch to English',
    'label.lang.text': 'EN'
  },
  en: {
    'page.title': 'CaishenDAO · Tokenomics',
    'mast.eb.cn': '',
    'mast.eb.en': 'Tokenomics Blueprint',
    'mast.sub': 'A Deflationary Ecosystem for Sustainable Growth',
    'mast.standard.k': 'Token Standard',
    'mast.inflation.k': 'Mint Authority',
    'mast.inflation.v': 'Null',
    'mast.status.k': 'Status',
    'mast.status.v': 'Pre-TGE',

    'toc.highlights': 'Highlights',
    'toc.overview': 'Overview',
    'toc.distribution': 'Distribution',
    'toc.vesting': 'Vesting',
    'toc.burn': 'Burn Mechanism',
    'toc.execution': 'Execution',
    'toc.risks': 'Risks',
    'toc.faq': 'FAQ',

    'abstract.p1': '$财神DAO has a fixed supply of <b>686,868,686</b> tokens with no future minting. <span class="hl">41.68%</span> of the supply is allocated to the "FDV Milestone Burn Pool" — as FDV increases, token tranches are permanently burned to the black hole address to be <span class="hl">removed from circulation</span>. Cumulative burns are capped at 286,291,150 tokens, with zero tokens returning to the team. The remaining 58.32% is distributed across Foundation, Community, Ecosystem, Liquidity, Operations, and Strategic Reserve. Most allocations feature a 3- to 36-month cliff and linear vesting. Liquidity allocations are partially released at TGE, with the remainder vesting linearly. All lockups are verifiable on-chain via independent addresses.',

    'hl.title': 'Core Highlights',
    'hl.1.t': 'Burn Allocation',
    'hl.1.d': '12 FDV milestones with a cumulative burn cap of 286,291,150 tokens. Never returns to the team.',
    'hl.2.t': 'Verifiable Lockups',
    'hl.2.d': 'Foundation, Community, and Ecosystem allocations are escrowed in Jupiter Lock contracts, fully verifiable by third parties.',
    'hl.3.t': '5/7 Multisig & Multi-Oracle',
    'hl.3.d': 'Executed via Squads 5/7 multisig. Median price aggregation from CoinGecko, CMC, and on-chain oracles eliminates single-point manipulation.',
    'hl.4.unit': 'Months',
    'hl.4.t': 'Smooth Vesting Curve',
    'hl.4.d': 'No large one-time unlocks. The longest vesting schedule spans 39 months, mitigating concentrated sell pressure.',
    'hl.5.t': 'Fixed Supply, No Inflation',
    'hl.5.d': 'Capped at genesis with zero mint authority. The deflationary path is hardcoded on-chain.',
    'hl.5.link': 'View Mint Transaction',

    'ov.title': 'Token Overview',
    'ov.name.k': 'Name',
    'ov.name.v': '财神到DAO God Of Fortune',
    'ov.symbol.k': 'Symbol',
    'ov.symbol.v': '$财神DAO',
    'ov.network.k': 'Network',
    'ov.network.v': 'Solana SPL',
    'ov.supply.k': 'Total Supply',
    'ov.tge.k': 'TGE (Token Generation Event)',
    'ov.tge.v': 'TBD · Subject to official announcement',
    'ov.ca.k': 'Contract Address (CA)',
    'ov.features.k': 'Core Features',
    'ov.features.v': 'Fixed supply · 41.68% allocated to burn · On-chain verifiable allocations',

    'dist.title': 'Token Distribution',
    'donut.center': 'Total Supply',
    'lg.0': 'FDV Milestone Burn Pool',
    'lg.1': 'Caishen Foundation',
    'lg.2': 'BG Foundation',
    'lg.3': 'Incense Offering Pool',
    'lg.4': 'Market Making / CEX / DEX',
    'lg.5': 'LUCKY99 Community',
    'lg.6': 'FIST Community',
    'lg.7': 'CY2000 Community',
    'lg.8': 'Ecosystem Development',
    'lg.9': 'Initial Liquidity',
    'lg.10': 'Airdrop / Marketing',
    'lg.11': 'Operations',
    'lg.12': 'Strategic Reserve',
    'unit.token': 'tokens',
    'vest.lock': 'Cliff',
    'vest.release': 'Vesting',
    'vest.none': 'None',
    'vest.by.milestone': 'By milestone',
    'vest.3m': '3 Mths.',
    'vest.36m.linear': '36-Mths Linear',
    'vest.12m.linear': '12-Mths Linear',
    'vest.18m.linear': '18-Mths Linear',
    'vest.open.inject': 'At open',
    'alloc.0.note': 'Executed via 5/7 multisig. Each FDV milestone triggers a permanent burn to the black hole address. Cumulative burn of 286,291,150 tokens, never returning to the team.',
    'alloc.1.note': 'Linear unlock over three years, deeply aligned with long-term project value.',
    'alloc.2.note': 'Linear unlock over three years, deeply aligned with long-term project value.',
    'alloc.3.note': '5% released at TGE (approx. 2,511,200 tokens), remaining 95% vests linearly over 12 months; targeted rewards for genuine participants.',
    'alloc.4.note': '10% released at TGE (approx. 4,121,212 tokens), remaining 90% vests linearly over 12 months; establishing trading depth before gradual release.',
    'alloc.5.note': 'Long-term linear unlock for community shares, mitigating concentrated sell pressure.',
    'alloc.6.note': 'Long-term linear unlock for community shares, mitigating concentrated sell pressure.',
    'alloc.7.note': 'New ecosystem partner allocation: 0% at TGE, no cliff, 36-month linear vesting from TGE for long-term synergy.',
    'alloc.8.note': '10% released at TGE (approx. 3,500,000 tokens), remaining 90% vests linearly over 18 months; deployed in batches according to development cadence.',
    'alloc.9.note': 'Establishes a Meteora DLMM liquidity pool, ensuring real tradable depth from the open.',
    'alloc.10.note': '10% released at TGE (approx. 1,373,737 tokens), remaining 90% vests linearly over 12 months; airdrops directly to real users, sustained marketing.',
    'alloc.11.note': '10% released at TGE (approx. 686,869 tokens), remaining 90% vests linearly over 12 months; ensuring daily operations and market promotion.',
    'alloc.12.note': 'Reserved for future partner communities and strategic partners. 3-month cliff followed by 36-month linear vesting to support long-term ecosystem synergy.',
    'dist.caption': '<b>Note:</b> <b>TGE</b> refers to the immediate release percentage at the Token Generation Event; the remainder unlocks according to the linear period specified in the "Vesting" column. "Linear vesting" means uniform unlocking over time, e.g., 36-month linear vesting releases 1/36 of the allocation each month — a smooth curve that avoids concentrated sell pressure. Full definitions of TGE and Cliff are provided in the glossary at the end of "03 Vesting Schedule".',

    'vest.title': 'Vesting Schedule',
    'tl.1.when': 'TGE · Month 0', 'tl.1.what': '≈ 32.2M tokens', 'tl.1.why': 'Initial circulating supply: 4.69%',
    'tl.2.when': 'Month 3', 'tl.2.what': '+233.5M tokens', 'tl.2.why': 'Foundation / Community / Reserve cliff ends',
    'tl.2.what2': '+233.5M tokens begin linear vesting', 'tl.2.why2': 'Foundation / Community / Strategic Reserve cliff ends, entering linear vesting',
    'tl.3.when': 'Month 12', 'tl.3.what': 'MM / Airdrop / Incense / Ops', 'tl.3.why': '12-month linear allocations fully vested',
    'tl.3.what2': 'MM / Airdrop / Incense / Ops complete',
    'tl.4.when': 'Month 18', 'tl.4.what': 'Ecosystem development complete', 'tl.4.why': '18-month linear vesting complete',
    'tl.5.when': 'Month 39', 'tl.5.what': 'All linear allocations fully vested', 'tl.5.why': 'Burn Pool remains locked; burns by milestone', 'tl.5.why2': 'Burn Pool remains locked; burns by milestone, not subject to linear vesting.',
    'tl.caption': 'Timeline is illustrative and excludes the Burn Pool. Burn Pool tokens are burned by milestone and are not subject to linear vesting.',

    'rel.1.title': 'Initial Liquidity',
    'rel.1.rule': '100% Unlocked at TGE',
    'rel.1.scope': 'Injected at open · Establishes a Meteora DLMM pool for immediate tradable depth',
    'rel.1.done': 'TGE Day',

    'rel.2.title': 'MM / Airdrop / Operations',
    'rel.2.rule': '10% at TGE · 12-Month Linear',
    'rel.2.scope': 'CEX/DEX Liquidity · Marketing & Events · Daily Operations | No cliff',

    'rel.3.title': 'Incense Offering Pool',
    'rel.3.rule': '5% at TGE · 12-Month Linear',
    'rel.3.scope': 'Targeted rewards for genuine participants | No cliff',

    'rel.4.title': 'Ecosystem Development',
    'rel.4.rule': '10% at TGE · 18-Month Linear',
    'rel.4.scope': 'Deployed in batches based on development cadence, no lump-sum release',

    'rel.5.title': 'Foundation / Community / Reserve',
    'rel.5.rule': '3-Month Cliff · 36-Month Linear',
    'rel.5.scope': 'Caishen/BG Foundation · Lucky99/Fist/CY2000 · Reserve | 39-month cycle aligns long-term interests with holders',

    'rel.6.title': 'FDV Milestone Burn Pool',
    'rel.6.rule': 'No Unlock · Milestone Burn Only',
    'rel.6.scope': 'Burned to black hole upon reaching FDV targets, never returning to the team',
    'rel.6.dest': 'Permanently Burned',

    'rel.cliff': 'Cliff', 'rel.monthly': 'Monthly', 'rel.done': 'Complete', 'rel.trigger': 'Trigger', 'rel.dest': 'Destination', 'rel.method': 'Method',
    'rel.total.cond': 'Total', 'rel.total.scope': 'Matches total supply · 100%',
    'rel.subtotal.cond': 'Of which: TGE Immediate Unlock', 'rel.subtotal.scope': 'Initial Liquidity 20M + MM/Airdrop/Ops 6.18M + Incense Pool 2.51M + Ecosystem 3.5M, approx. 4.69% of total supply.',
    'vest.note': '<b>Glossary:</b>',
    'vest.note.1': '<b>TGE</b> (Token Generation Event) — The moment the token is first minted and listed, serving as the starting point for all cliffs and vesting schedules.',
    'vest.note.2': '<b>Cliff</b> — A period during which no tokens are unlocked.',
    'vest.note.3': '<b>Vesting</b> — The gradual unlocking of tokens over time after the cliff period.',
    'vest.note.footer': 'All lockup and vesting arrangements are executed via Jupiter Lock on-chain escrow, independently verifiable by third parties, and cannot be unilaterally altered by the project team.',

    'burn.title': 'Burn Mechanism',
    'burn.intro': 'Rising price drives FDV growth, triggering sequential tranche burns. Higher prices yield larger burns, creating a positive feedback loop: <b>Price ↑ → Deflation → Scarcity</b>. Once all 12 tranches are triggered, 286,291,150 tokens (41.68% of total supply) will be permanently burned, never returning to the team. The Burn Pool is accounted for separately and fully isolated from Foundation and Community allocations.',
    'burn.tbl.title': 'FDV Burn Table', 'burn.tbl.meta': '12 Tranches · 286.29M Tokens',
    'burn.th.1': 'Stage', 'burn.th.2': 'FDV Trigger', 'burn.th.3': 'Tranche Burn', 'burn.th.4': 'Cumulative Burn', 'burn.th.5': 'Remaining Supply',
    'burn.swipe': 'Swipe to view full data',
    'chart.sub': 'Cumulative burn as FDV rises',
    'chart.tier1': 'Startup', 'chart.tier2': 'Growth', 'chart.tier3': 'Breakthrough', 'chart.tier4': 'Maturity',
    'kpi.1': 'Max Cumulative Burn (Tokens)', 'kpi.2': 'Of Total Supply', 'kpi.3': 'Remaining Supply After All Triggers',
    'burn.caption': '<b>FDV (Fully Diluted Valuation)</b> = Price × Original Total Supply (686,868,686). The calculation basis is fixed and independent of circulating supply. The 12 targets are progressive, with larger burns per tranche. Once fully triggered, cumulative burns will reach 41.68% of total supply. Currency units: M = Million, B = Billion.',

    'exec.title': 'Execution & Governance',
    'exec.1.v': 'FDV = Price × Original Total Supply (686,868,686). The calculation basis is fixed and independent of circulating supply.',
    'exec.2.v': 'Median price aggregation from CoinGecko, CMC, and on-chain oracles. A single data source cannot influence the outcome, preventing manipulation at the source.',
    'exec.3.v': 'Executed via a 5/7 multisig comprising the <b>Caishen Foundation</b> (2 seats), <b>Community</b> (4 seats), and an <b>Independent Third Party</b> (1 seat). No single entity can act unilaterally. Signer addresses are public and verifiable on Solscan. With 4/7 community seats, the 5/7 threshold ensures cross-party consensus; neither the team nor the community can execute decisions unilaterally.',
    'exec.4.v': '$财神DAO is the governance token. Holders can propose on:<br>(1) Ecosystem Fund allocation;<br>(2) Burn milestone parameters (thresholds, windows);<br>(3) Multisig signer rotation;<br>(4) Major partnerships & expenditures.<br>The governance framework will be introduced progressively, with detailed procedures announced separately.',
    'exec.5.v': 'Solana black hole address, permanently locked upon transfer and unrecoverable:<br><code>1nc1nerator11111111111111111111111111111111</code>',
    'exec.6.v': 'The transaction hash, amount, timestamp, and executor of every burn are publicly disclosed and independently verifiable on-chain.',
    'exec.7.v': 'The Burn Pool remains locked, never returning to the team, nor repurposed.',
    'exec.8.v': 'If multiple tiers are triggered at once, they are executed sequentially, without skipping or merging, and each tier is independently verifiable.',

    'risk.title': 'Risks & Disclaimers',
    'risk.intro': '<b>Important:</b> Digital asset investments carry significant risk, including total loss of principal. Do not invest funds you cannot afford to lose. All figures and mechanisms on this page are for informational purposes and do not constitute investment advice or a solicitation.',
    'risk.1': '<b>Market Risk</b> — Digital asset prices are highly volatile and may rapidly depreciate to zero. The project does not guarantee principal protection or any form of return.',
    'risk.2': '<b>Liquidity Risk</b> — The token may lack sufficient trading depth at certain stages. Unlocks, market sentiment, or large holder actions may cause price impact, and some orders may not be filled at expected prices.',
    'risk.3': '<b>Smart Contract Risk</b> — The SPL token, Jupiter Lock, and Squads multisig contracts may contain undiscovered vulnerabilities, which in extreme cases could lead to irreversible asset loss.',
    'risk.4': '<b>Oracle & Data Source Risk</b> — Burn triggers rely on CoinGecko, CMC, and on-chain oracles. Data source failures, manipulation, or significant divergence may result in delayed, disputed, or erroneous triggers.',
    'risk.5': '<b>Execution & Governance Risk</b> — Burns, lockups, and fund transfers depend on the 5/7 multisig. Signers may become unreachable, disagree, delay execution, or engage in malicious behavior. The governance framework is still under development; voting weights and processes may be adjusted.',
    'risk.6': '<b>Regulatory Risk</b> — Regulatory uncertainty exists across jurisdictions. The token may be classified as a security, commodity, or other regulated asset in certain jurisdictions, restricting its circulation or trading, or leading to project termination.',
    'risk.7': '<b>Concentration Risk</b> — Early-stage token holdings may be highly concentrated. Large holder trading behavior may significantly affect price and market depth.',
    'risk.8': '<b>Operational Risk</b> — The project relies heavily on the team\'s continuous commitment. Personnel changes, insufficient funding, or external environment shifts may lead to roadmap delays, mechanism adjustments, or temporary suspension.',
    'legal.1': '<b>Regional Restrictions:</b> This token and page content are not intended for residents of the United States, Mainland China, sanctioned regions, or any jurisdiction where digital asset trading is prohibited. Please verify local laws before use; any liability for legal violations is borne solely by the user.',
    'legal.2': '<b>Token Nature:</b> $财神DAO is <b>not a security, equity, or debt instrument, and confers no ownership or profit-sharing rights</b>. It does not promise any return, interest, or yield. The token is solely for functional access and governance within the ecosystem.',
    'legal.3': '<b>Forward-Looking Statements:</b> Words such as "will," "plan," "expect," "target," and "anticipate" are forward-looking statements based on current assumptions and may become inaccurate. Such statements do not constitute guarantees; actual results may differ materially.',
    'legal.4': '<b>Tax Liability:</b> Holding, trading, or disposing of $财神DAO may trigger tax obligations. Users must consult their own professional tax advisors. All tax liabilities are solely the responsibility of the user.',
    'legal.disc': '<b>Disclaimer:</b> All content is for informational purposes only and does not constitute investment, legal, tax, or accounting advice. Before making any decision related to $财神DAO, conduct your own research and consult licensed professionals.',

    'faq.title': 'Frequently Asked Questions',
    'faq.expand': 'Expand All',
    'faq.collapse': 'Collapse All',
    'faq.1.q': 'How is FDV calculated?',
    'faq.1.a': 'FDV = Price × Original Total Supply of <b>686,868,686</b>. Using the original total supply rather than circulating supply keeps the trigger basis fixed and prevents standard drift as tokens unlock. Regardless of how much is burned or released, the trigger price for each tier remains predictable.',
    'faq.2.q': 'Where do the burned tokens go? Can they be recovered?',
    'faq.2.a': 'They are sent to the Solana black hole address <code>1nc1nerator...1111</code>. The private key does not exist; it is publicly verifiable, permanently locked, and unrecoverable. Transaction hashes and executors are fully disclosed.',
    'faq.3.q': 'What if the $1B FDV milestone is not reached?',
    'faq.3.a': 'The Burn Pool remains locked — <b>it never returns to the team, nor is it repurposed</b>. Triggered tiers are burned as usual; untriggered portions remain untouched. Even if the project ceases operations, these tokens cannot be accessed by the team.',
    'faq.4.q': 'Will there be a sell-off when lockups expire?',
    'faq.4.a': 'The majority of vesting allocations feature a <b>3-month cliff + 36-month linear vesting</b>, releasing only 1/36 per month. The longest allocations stretch to 39 months, mitigating concentrated sell pressure. All lockups are escrowed via Jupiter Lock and independently verifiable.',
    'faq.5.q': 'How are team allocations handled to prevent a rug pull?',
    'faq.5.a': 'Team shares are included in the "Caishen Foundation" allocation, subject to the same 3-month cliff + 36-month linear vesting, aligning interests with all holders. The Burn Pool is isolated from team shares and <b>never returns to the team</b>. Burns require 5/7 multisig execution, eliminating single-point control risk.',
    'faq.6.q': 'Can burn trigger data be manipulated?',
    'faq.6.a': 'Data sources include CoinGecko, CMC, and on-chain oracles, taking the <b>median of multiple sources</b>; no single source can influence the outcome. Execution requires a 5/7 multisig. The calculation basis is fixed and independent of circulating supply.',
    'faq.7.q': 'Who are the 7 multisig signers? Can they act maliciously?',
    'faq.7.a': 'Signers represent the Caishen Foundation (2), Community (4), and an Independent Third Party (1). No single entity can unilaterally move funds or trigger burns; at least 5 signatures are required. With 4/7 community seats, the 5/7 threshold requires at least one vote from the Foundation or Third Party, <b>ensuring cross-party consensus</b> — preventing both unilateral team control and hasty majority decisions. Signer rotation is governed by the governance process.',
    'faq.8.q': 'What governance decisions can holders participate in?',
    'faq.8.a': 'Governance covers: Ecosystem Fund use, burn parameter tuning, multisig signer rotation, and major partnerships & expenditures. The framework will be introduced progressively; until then, these matters are executed by the 5/7 multisig with public disclosure. Once live, proposal and voting processes will be announced.',
    'faq.9.q': 'Which regions are accepted?',
    'faq.9.a': 'This token and page content are not intended for residents of the United States, Mainland China, sanctioned regions, or any jurisdiction where digital asset trading is prohibited. Verify local laws before use. The token is permissionless, but users are responsible for ensuring compliance with local regulations.',

    'foot.channels': 'Official Channels',
    'foot.ch.1': 'Website',
    'foot.ch.4.url': 'Invite Code: RmrnJBvZ',
    'foot.ch.5.url': 'solscan.io · On-chain Verification',
    'foot.ch.6.url': 'lock.jup.ag · Lockup Escrow',
    'foot.disc': 'This document is for informational purposes only and does not constitute investment, legal, tax, or accounting advice. Digital asset prices are highly volatile; exercise rational judgment. For full risk disclosure, see "06 Risks & Disclaimers". Document v1.7 · Last updated 2026-10-18.',

    'toast.copy.ca': 'Contract address copied',
    'toast.copy.invite': 'Invite code copied',
    'label.theme.dark': 'Switch to dark mode',
    'label.theme.light': 'Switch to light mode',
    'label.lang.switch': '切换到中文',
    'label.lang.text': '中文'
  }
};

/* ================= 交互逻辑 ================= */
(function () {
  'use strict';

  var htmlEl = document.documentElement;
  var root = document.documentElement;
  var themeBtn = document.getElementById('themeToggle');
  var langBtn = document.getElementById('langToggle');

  /* ---------- theme-color meta（动态创建） ---------- */
  var themeColorMeta = document.createElement('meta');
  themeColorMeta.name = 'theme-color';
  document.head.appendChild(themeColorMeta);

  function setThemeColor(isDark) {
    themeColorMeta.content = isDark ? '#0a0e14' : '#ffffff';
  }

  /* ---------- Toast ---------- */
  var toast = document.getElementById('toast');
  var toastTimer = null;

  function showToast(msgKey) {
    if (!toast) return;
    var lang = htmlEl.getAttribute('data-lang') || 'zh';
    var msg = (I18N[lang] && I18N[lang][msgKey]) || msgKey;
    toast.textContent = msg;
    toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toast.classList.remove('show'); }, 1800);
  }

  /* ---------- 复制工具 ---------- */
  function fallbackCopy(text, cb) {
    var ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.top = '-1000px';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    ta.setSelectionRange(0, text.length);
    try { document.execCommand('copy'); cb && cb(); } catch (e) {}
    document.body.removeChild(ta);
  }

  function copyText(text, cb) {
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(text).then(cb).catch(function () { fallbackCopy(text, cb); });
    } else {
      fallbackCopy(text, cb);
    }
  }

  /* ---------- 合约地址复制按钮 ---------- */
  var copyBtn = document.getElementById('copyBtn');
  if (copyBtn) {
    var icoCopy  = copyBtn.querySelector('.ico-copy');
    var icoCheck = copyBtn.querySelector('.ico-check');
    copyBtn.addEventListener('click', function () {
      copyText(copyBtn.getAttribute('data-addr'), function () {
        icoCopy.style.display = 'none';
        icoCheck.style.display = 'block';
        copyBtn.classList.add('copied');
        showToast('toast.copy.ca');
        setTimeout(function () {
          icoCopy.style.display = 'block';
          icoCheck.style.display = 'none';
          copyBtn.classList.remove('copied');
        }, 1500);
      });
    });
  }

  /* ---------- 邀请码复制按钮 ---------- */
  document.querySelectorAll('.ch-copy').forEach(function (b) {
    b.addEventListener('click', function (e) {
      e.preventDefault();
      e.stopPropagation();
      copyText(b.getAttribute('data-copy'), function () {
        b.classList.add('copied');
        showToast('toast.copy.invite');
        setTimeout(function () { b.classList.remove('copied'); }, 1500);
      });
    });
  });

  /* ---------- 环形图联动高亮 ---------- */
  var donutSegs = document.querySelectorAll('.donut-seg');
  var legendItems = document.querySelectorAll('.lg-item[data-seg]');

  function highlightSeg(idx) {
    donutSegs.forEach(function (seg) {
      if (seg.getAttribute('data-seg') === idx) {
        seg.classList.remove('dim');
        seg.classList.add('highlight');
      } else {
        seg.classList.add('dim');
        seg.classList.remove('highlight');
      }
    });
  }
  function clearSegHighlight() {
    donutSegs.forEach(function (seg) {
      seg.classList.remove('dim');
      seg.classList.remove('highlight');
    });
  }

  if (donutSegs.length) {
    legendItems.forEach(function (item) {
      var idx = item.getAttribute('data-seg');
      item.addEventListener('mouseenter', function () { highlightSeg(idx); });
      item.addEventListener('mouseleave', clearSegHighlight);
      item.addEventListener('focus', function () { highlightSeg(idx); });
      item.addEventListener('blur', clearSegHighlight);
    });
    donutSegs.forEach(function (seg) {
      var idx = seg.getAttribute('data-seg');
      seg.addEventListener('mouseenter', function () { highlightSeg(idx); });
      seg.addEventListener('mouseleave', clearSegHighlight);
      seg.addEventListener('focus', function () { highlightSeg(idx); });
      seg.addEventListener('blur', clearSegHighlight);
    });
  }

  /* ---------- TOC 滚动高亮 ---------- */
  var links = Array.prototype.slice.call(document.querySelectorAll('.toc-link'));
  if (links.length) {
    var sections = links
      .map(function (a) { return document.querySelector(a.getAttribute('href')); })
      .filter(Boolean);

    if (sections.length && ('IntersectionObserver' in window)) {
      var linkMap = {};
      links.forEach(function (a) { linkMap[a.getAttribute('href')] = a; });

      var obs = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            links.forEach(function (a) { a.classList.remove('active'); });
            var a = linkMap['#' + entry.target.id];
            if (a) {
              a.classList.add('active');
              var toc = a.parentElement;
              if (toc && toc.scrollWidth > toc.clientWidth) {
                var target = a.offsetLeft - toc.clientWidth / 2 + a.offsetWidth / 2;
                toc.scrollTo({ left: Math.max(0, target), behavior: 'smooth' });
              }
            }
          }
        });
      }, { rootMargin: '-56px 0px -70% 0px', threshold: 0 });

      sections.forEach(function (s) { obs.observe(s); });
    }
  }

  /* ---------- 主题 ---------- */
  var darkMQ = window.matchMedia('(prefers-color-scheme: dark)');
  var STORAGE_KEY = 'gof-theme';
  var LANG_KEY = 'gof-lang';

  function currentTheme() {
    var attr = root.getAttribute('data-theme');
    if (attr === 'dark' || attr === 'light') return attr;
    return darkMQ.matches ? 'dark' : 'light';
  }

  function applyDonutTheme(isDark) {
    donutSegs.forEach(function (seg) {
      var darkStroke = seg.getAttribute('data-dark-stroke');
      var baseStroke = seg.getAttribute('data-base-stroke') || seg.getAttribute('stroke');
      seg.setAttribute('stroke', (isDark && darkStroke) ? darkStroke : baseStroke);
    });
  }

  /* ---------- 语言切换 ---------- */
  function setLang(lang) {
    if (!I18N[lang]) lang = 'zh';
    var d = I18N[lang];

    document.querySelectorAll('[data-i18n]').forEach(function (el) {
      var k = el.getAttribute('data-i18n');
      if (d[k] != null) el.textContent = d[k];
    });

    document.querySelectorAll('[data-i18n-html]').forEach(function (el) {
      var k = el.getAttribute('data-i18n-html');
      if (d[k] != null) el.innerHTML = d[k];
    });

    document.title = d['page.title'];
    htmlEl.setAttribute('data-lang', lang);
    htmlEl.setAttribute('lang', lang === 'zh' ? 'zh-CN' : 'en');

    langBtn.setAttribute('aria-label', d['label.lang.switch']);
    langBtn.textContent = d['label.lang.text'];

    var faqBtn = document.getElementById('faqToggleAll');
    if (faqBtn) {
      var span = faqBtn.querySelector('span');
      if (span) {
        var faqAllOpen = faqBtn.getAttribute('data-open') === 'true';
        span.textContent = d[faqAllOpen ? 'faq.collapse' : 'faq.expand'];
      }
    }

    try { localStorage.setItem(LANG_KEY, lang); } catch (e) {}
  }

  langBtn.addEventListener('click', function () {
    setLang(htmlEl.getAttribute('data-lang') === 'zh' ? 'en' : 'zh');
  });

  // 初始化语言（init.js 已设置 data-lang）
  setLang(htmlEl.getAttribute('data-lang') || 'zh');

  /* ---------- 主题应用 ---------- */
  function applyUI() {
    var t = currentTheme();
    if (themeBtn) {
      themeBtn.setAttribute('data-icon', t);
      var lang = htmlEl.getAttribute('data-lang') || 'zh';
      var label = I18N[lang][t === 'dark' ? 'label.theme.light' : 'label.theme.dark'];
      themeBtn.setAttribute('aria-label', label);
      themeBtn.title = label;
    }
    applyDonutTheme(t === 'dark');
    setThemeColor(t === 'dark');
  }

  if (themeBtn) {
    themeBtn.addEventListener('click', function () {
      var next = currentTheme() === 'dark' ? 'light' : 'dark';
      root.setAttribute('data-theme', next);
      try { localStorage.setItem(STORAGE_KEY, next); } catch (e) {}
      applyUI();
    });
  }

  function onSystemChange() {
    if (!root.hasAttribute('data-theme')) applyUI();
  }
  if (darkMQ.addEventListener) darkMQ.addEventListener('change', onSystemChange);
  else if (darkMQ.addListener) darkMQ.addListener(onSystemChange);

  applyUI();

  /* ---------- FAQ 全部展开/收起 ---------- */
  var faqBtn = document.getElementById('faqToggleAll');
  var faqItems = document.querySelectorAll('.faq-item');

  if (faqBtn) {
    faqBtn.addEventListener('click', function () {
      var faqAllOpen = faqBtn.getAttribute('data-open') !== 'true';
      faqBtn.setAttribute('data-open', faqAllOpen);

      faqItems.forEach(function (d) { d.open = faqAllOpen; });

      var span = faqBtn.querySelector('span');
      if (span) {
        var lang = htmlEl.getAttribute('data-lang') || 'zh';
        var d = I18N[lang];
        span.textContent = d[faqAllOpen ? 'faq.collapse' : 'faq.expand'];
      }

      var svg = faqBtn.querySelector('svg');
      if (svg) svg.style.transform = faqAllOpen ? 'rotate(180deg)' : '';
    });
  }

  /* ---------- 返回顶部 ---------- */
  var backTop = document.getElementById('backTop');
  if (backTop) {
    var onScroll = function () {
      if (window.scrollY > 600) backTop.classList.add('show');
      else backTop.classList.remove('show');
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();

    backTop.addEventListener('click', function () {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  }

  /* ---------- 表格滚动提示（.scroll-hint） ---------- */
  document.querySelectorAll('.scroll-hint').forEach(function (el) {
    var check = function () {
      if (el.scrollWidth > el.clientWidth && el.scrollLeft + el.clientWidth < el.scrollWidth - 1) {
        el.classList.remove('at-end');
      } else {
        el.classList.add('at-end');
      }
    };
    el.addEventListener('scroll', check, { passive: true });
    window.addEventListener('resize', check);
    check();
  });

})();
