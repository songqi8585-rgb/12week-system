/* ============================================
   12周执行系统 - 主逻辑
   ============================================ */

// ── 数据模型 ──────────────────────────────────
const STORAGE_KEY = 't007_12week_system';

const DEFAULT_DATA = {
  meta: {
    currentWeek: 1,
    startDate: null, // 12周起始日期
    createdAt: null,
  },
  vision: {
    longTerm: {
      personal: '',
      business: '',
      other: '',
    },
    midTerm: {
      personal: '',
      business: '',
      other: '',
    },
    yearOne: {
      personal: '',
      business: '',
      other: '',
    },
    notes: '',
  },
  goals: [], // 12周目标
  // 目标结构: { id, title, measurable, deadline, strategies: [{id, text, week, completed}] }
  weekPlans: {}, // { weekNum: { adjustedStrategies: [], extraTasks: [{id, text, done}] } }
  dailyChecks: {}, // { "weekNum-dayNum": { date, checks: { strategyId: done, taskId: done } } }
  weeklyReviews: {}, // { weekNum: { completionRate, uncompletedReasons: [{id, reason}], adjustments, done } }
  timeBlocks: {}, // { weekNum: { mon: [{start, end, type, note}], ... } }
};

// ── 存储层 ──────────────────────────────────
let data = loadData();

function loadData() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      // 合并默认值确保字段完整
      return deepMerge(JSON.parse(JSON.stringify(DEFAULT_DATA)), parsed);
    }
  } catch (e) {
    console.error('数据加载失败:', e);
  }
  return JSON.parse(JSON.stringify(DEFAULT_DATA));
}

function saveData() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

function deepMerge(target, source) {
  for (const key in source) {
    if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
      target[key] = deepMerge(target[key] || {}, source[key]);
    } else {
      target[key] = source[key];
    }
  }
  return target;
}

// ── 工具函数 ──────────────────────────────────
function uid() {
  return Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
}

function $(sel) { return document.querySelector(sel); }
function $$(sel) { return document.querySelectorAll(sel); }

function toast(msg) {
  let t = $('#toast');
  if (!t) {
    t = document.createElement('div');
    t.id = 'toast';
    t.className = 'toast';
    document.body.appendChild(t);
  }
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2000);
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str || '';
  return div.innerHTML;
}

// 获取某周的策略（从12周计划自动提取）
function getStrategiesForWeek(weekNum) {
  const strategies = [];
  for (const goal of data.goals) {
    for (const s of (goal.strategies || [])) {
      if ((s.weeks && s.weeks.includes(weekNum)) || (!s.weeks && s.week === weekNum)) {
        strategies.push({
          ...s,
          goalTitle: goal.title,
          goalId: goal.id,
        });
      }
    }
  }
  return strategies;
}

// 获取某周的额外任务（周计划中手动添加的）
function getExtraTasksForWeek(weekNum) {
  const wp = data.weekPlans[weekNum];
  return (wp && wp.extraTasks) || [];
}

// 计算某周完成率
function calculateWeekCompletion(weekNum) {
  const strategies = getStrategiesForWeek(weekNum);
  const extraTasks = getExtraTasksForWeek(weekNum);
  const total = strategies.length + extraTasks.length;
  if (total === 0) return null;

  // 基于每日打勾数据计算完成率
  // 一个策略/任务在一周7天中，只要有一天打了勾就算"已执行"
  // 完成率 = 已执行的天数 / (总数 × 7天) 的比例
  // 但更直觉的方式是：看每个项目在这周是否被执行过（至少打勾1次）
  let completed = 0;
  
  for (const s of strategies) {
    // 检查每日打勾记录
    let hasCheck = false;
    for (let day = 1; day <= 7; day++) {
      const key = weekNum + '-' + day;
      const dc = data.dailyChecks[key];
      if (dc && dc.checks && dc.checks[s.id]) {
        hasCheck = true;
        break;
      }
    }
    // 或者策略被标记为全局完成
    if (hasCheck || s.completed) completed++;
  }
  
  for (const t of extraTasks) {
    let hasCheck = false;
    for (let day = 1; day <= 7; day++) {
      const key = weekNum + '-' + day;
      const dc = data.dailyChecks[key];
      if (dc && dc.checks && dc.checks[t.id]) {
        hasCheck = true;
        break;
      }
    }
    if (hasCheck || t.done) completed++;
  }

  return { completed, total, rate: Math.round(completed / total * 100) };
}

// ── 导航 ──────────────────────────────────
function switchPage(pageName) {
  $$('.page').forEach(p => p.classList.remove('active'));
  $$('.nav-tab').forEach(t => t.classList.remove('active'));
  $('#page-' + pageName).classList.add('active');
  $(`.nav-tab[data-page="${pageName}"]`).classList.add('active');

  // 渲染对应页面
  switch (pageName) {
    case 'dashboard': renderDashboard(); break;
    case 'vision': renderVision(); break;
    case 'plan12': renderPlan12(); break;
    case 'weekplan': renderWeekPlan(); break;
    case 'daily': renderDaily(); break;
    case 'review': renderReview(); break;
    case 'timeblock': renderTimeBlock(); break;
  }
}

// ── 周次选择器 ──────────────────────────────────
function initWeekSelect() {
  const sel = $('#current-week-select');
  sel.innerHTML = '';
  for (let i = 1; i <= 12; i++) {
    const opt = document.createElement('option');
    opt.value = i;
    opt.textContent = i;
    if (i === data.meta.currentWeek) opt.selected = true;
    sel.appendChild(opt);
  }
  sel.addEventListener('change', () => {
    data.meta.currentWeek = parseInt(sel.value);
    saveData();
    updateWeekBar();
    // 重新渲染当前页面
    const activeTab = $('.nav-tab.active');
    if (activeTab) switchPage(activeTab.dataset.page);
  });
  updateWeekBar();
}

function updateWeekBar() {
  const w = data.meta.currentWeek;
  const completion = calculateWeekCompletion(w);
  const statusEl = $('#week-status');
  if (completion) {
    const cls = completion.rate >= 85 ? 'rate-good' : completion.rate >= 60 ? 'rate-warn' : 'rate-poor';
    statusEl.innerHTML = `本周完成率: <span class="${cls}" style="font-weight:700">${completion.rate}%</span> (${completion.completed}/${completion.total})`;
  } else {
    statusEl.textContent = '本周暂无任务';
  }
}

// ════════════════════════════════════════════
// 页面1: 看板
// ════════════════════════════════════════════
function renderDashboard() {
  const container = $('#page-dashboard');
  const week = data.meta.currentWeek;
  const completion = calculateWeekCompletion(week);

  // 计算12周整体数据
  const weekRates = [];
  for (let i = 1; i <= 12; i++) {
    const c = calculateWeekCompletion(i);
    weekRates.push(c ? c.rate : null);
  }

  const validRates = weekRates.filter(r => r !== null);
  const avgRate = validRates.length ? Math.round(validRates.reduce((a,b)=>a+b,0) / validRates.length) : 0;

  // 目标进度
  let goalsHtml = '';
  if (data.goals.length === 0) {
    goalsHtml = '<div class="empty-state"><p>还没有设定12周目标</p><button class="btn btn-primary btn-sm" onclick="switchPage(\'plan12\')">去设定</button></div>';
  } else {
    for (const goal of data.goals) {
      const strategies = goal.strategies || [];
      const completed = strategies.filter(s => s.completed).length;
      const total = strategies.length;
      const rate = total ? Math.round(completed/total*100) : 0;
      goalsHtml += `
        <div style="margin-bottom:12px">
          <div style="display:flex;justify-content:space-between;margin-bottom:4px">
            <span style="font-weight:600">${escapeHtml(goal.title)}</span>
            <span class="${rate>=85?'rate-good':rate>=60?'rate-warn':'rate-poor'}" style="font-weight:700">${rate}%</span>
          </div>
          <div class="progress-bar"><div class="progress-bar-fill ${rate>=85?'':rate>=60?'warning':'danger'}" style="width:${rate}%"></div></div>
          <div style="font-size:12px;color:var(--text-light);margin-top:2px">${completed}/${total} 策略完成</div>
        </div>
      `;
    }
  }

  // 本周关键行动
  const weekStrategies = getStrategiesForWeek(week);
  const weekExtras = getExtraTasksForWeek(week);
  let actionsHtml = '';
  if (weekStrategies.length === 0 && weekExtras.length === 0) {
    actionsHtml = '<div class="empty-state"><p>本周还没有关键行动</p><button class="btn btn-primary btn-sm" onclick="switchPage(\'plan12\')">去12周计划设定策略</button></div>';
  } else {
    for (const s of weekStrategies) {
      actionsHtml += `
        <div class="list-item">
          <div class="checkbox ${s.completed?'checked':''}" onclick="toggleStrategy('${s.goalId}','${s.id}')"></div>
          <div class="list-item-content">
            <div>${escapeHtml(s.text)}</div>
            <div style="font-size:12px;color:var(--text-light);margin-top:2px">目标: ${escapeHtml(s.goalTitle)}</div>
          </div>
        </div>
      `;
    }
    for (const t of weekExtras) {
      actionsHtml += `
        <div class="list-item">
          <div class="checkbox ${t.done?'checked':''}" onclick="toggleExtraTask(${week},'${t.id}')"></div>
          <div class="list-item-content"><div>${escapeHtml(t.text)}</div></div>
        </div>
      `;
    }
  }

  container.innerHTML = `
    <div class="dashboard-grid">
      <div class="stat-card">
        <div class="stat-value">${completion ? completion.rate + '%' : '—'}</div>
        <div class="stat-label">本周完成率</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${avgRate}%</div>
        <div class="stat-label">12周平均完成率</div>
      </div>
    </div>

    <div class="card" style="margin-top:16px">
      <div class="card-title">12周完成率趋势</div>
      <div class="chart-container"><canvas id="trend-chart"></canvas></div>
    </div>

    <div class="dashboard-grid" style="margin-top:16px">
      <div class="card">
        <div class="card-title">目标进度 <span class="badge">${data.goals.length}个目标</span></div>
        ${goalsHtml}
      </div>
      <div class="card">
        <div class="card-title">本周关键行动 <span class="badge">第${week}周</span></div>
        ${actionsHtml}
      </div>
    </div>
  `;

  // 绘制折线图
  drawTrendChart(weekRates);
}

function drawTrendChart(rates) {
  const canvas = $('#trend-chart');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const rect = canvas.getBoundingClientRect();
  if (rect.width === 0) {
    // Canvas not laid out yet, retry after layout
    setTimeout(() => drawTrendChart(rates), 50);
    return;
  }
  canvas.width = rect.width * 2;
  canvas.height = rect.height * 2;
  ctx.scale(2, 2);

  // Clear canvas (in case of re-render)
  ctx.clearRect(0, 0, rect.width, rect.height);

  const w = rect.width;
  const h = rect.height;
  const padding = { left: 35, right: 15, top: 15, bottom: 25 };
  const chartW = w - padding.left - padding.right;
  const chartH = h - padding.top - padding.bottom;

  // 背景网格（压低透明度，让达标线更突出）
  ctx.strokeStyle = 'rgba(255,255,255,0.04)';
  ctx.lineWidth = 1;
  for (let i = 0; i <= 4; i++) {
    const y = padding.top + (chartH / 4) * i;
    ctx.beginPath();
    ctx.moveTo(padding.left, y);
    ctx.lineTo(w - padding.right, y);
    ctx.stroke();
  }

  // Y轴标签（压低透明度）
  ctx.fillStyle = 'rgba(142,142,150,0.5)';
  ctx.font = '11px sans-serif';
  ctx.textAlign = 'right';
  for (let i = 0; i <= 4; i++) {
    const y = padding.top + (chartH / 4) * i;
    ctx.fillText((100 - i * 25) + '%', padding.left - 5, y + 3);
  }

  // 85%达标线（最清晰、最实）
  const y85 = padding.top + chartH * (1 - 85/100);
  ctx.strokeStyle = '#5AE8A0';
  ctx.lineWidth = 2;
  ctx.setLineDash([6, 3]);
  ctx.beginPath();
  ctx.moveTo(padding.left, y85);
  ctx.lineTo(w - padding.right, y85);
  ctx.stroke();
  ctx.setLineDash([]);
  // 达标线标签
  ctx.fillStyle = '#5AE8A0';
  ctx.font = 'bold 11px sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('达标 85%', padding.left + 4, y85 - 4);

  // X轴标签
  ctx.fillStyle = 'rgba(142,142,150,0.6)';
  ctx.textAlign = 'center';
  for (let i = 0; i < 12; i++) {
    const x = padding.left + (chartW / 11) * i;
    ctx.fillText('W' + (i+1), x, h - padding.bottom + 15);
  }

  // 数据点和连线
  const points = [];
  for (let i = 0; i < 12; i++) {
    if (rates[i] !== null) {
      const x = padding.left + (chartW / 11) * i;
      const y = padding.top + chartH * (1 - rates[i]/100);
      points.push({ x, y, rate: rates[i], week: i+1 });
    }
  }

  if (points.length > 0) {
    // 连线
    ctx.strokeStyle = '#6E5AE8';
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let i = 0; i < points.length; i++) {
      if (i === 0) ctx.moveTo(points[i].x, points[i].y);
      else ctx.lineTo(points[i].x, points[i].y);
    }
    ctx.stroke();

    // 数据点
    for (const p of points) {
      ctx.beginPath();
      ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
      ctx.fillStyle = p.rate >= 85 ? '#5AE8A0' : p.rate >= 60 ? '#E8A55A' : '#E85A5A';
      ctx.fill();
      ctx.strokeStyle = '#16161B';
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    // 当前周高亮 — 奔跑小人
    const currentPoint = points.find(p => p.week === data.meta.currentWeek);
    if (currentPoint) {
      const cx = currentPoint.x, cy = currentPoint.y;
      // 光晕
      ctx.beginPath();
      ctx.arc(cx, cy, 12, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(232,90,90,0.15)';
      ctx.fill();
      // 奔跑小人 - 简笔画
      ctx.strokeStyle = '#E85A5A';
      ctx.fillStyle = '#E85A5A';
      ctx.lineWidth = 2;
      ctx.lineCap = 'round';
      // 头
      ctx.beginPath();
      ctx.arc(cx, cy - 8, 3, 0, Math.PI * 2);
      ctx.fill();
      // 身体（倾斜）
      ctx.beginPath();
      ctx.moveTo(cx, cy - 5);
      ctx.lineTo(cx - 2, cy + 2);
      ctx.stroke();
      // 前腿
      ctx.beginPath();
      ctx.moveTo(cx - 2, cy + 2);
      ctx.lineTo(cx + 4, cy + 7);
      ctx.stroke();
      // 后腿
      ctx.beginPath();
      ctx.moveTo(cx - 2, cy + 2);
      ctx.lineTo(cx - 5, cy + 6);
      ctx.stroke();
      // 前臂
      ctx.beginPath();
      ctx.moveTo(cx, cy - 3);
      ctx.lineTo(cx + 5, cy - 1);
      ctx.stroke();
      // 后臂
      ctx.beginPath();
      ctx.moveTo(cx, cy - 3);
      ctx.lineTo(cx - 4, cy - 5);
      ctx.stroke();
    }
  }
}

// ════════════════════════════════════════════
// 页面2: 愿景
// ════════════════════════════════════════════
function renderVision() {
  const container = $('#page-vision');
  const v = data.vision;

  // Migrate old data structure if needed
  if (!v.longTerm) {
    v.longTerm = { personal: '', business: '', other: '' };
    v.midTerm = { personal: '', business: '', other: '' };
    v.yearOne = { personal: '', business: '', other: '' };
  }

  container.innerHTML = `
    <div class="card">
      <div class="card-title">愿景 <span class="badge">你想成为什么样的人</span></div>
      <p style="color:var(--text-secondary);margin-bottom:20px;font-size:13px">愿景是一切高绩效的起点。先想清楚你要什么，12周目标才能对齐。</p>

      <div class="vision-block">
        <div class="vision-block-header">
          <div class="vision-block-title">长期愿景</div>
          <div class="vision-block-desc">你未来5-10年想要成为什么样的人</div>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label>个人领域</label>
            <textarea data-vision="longTerm.personal" placeholder="你想成为什么样的人">${escapeHtml(v.longTerm.personal)}</textarea>
          </div>
          <div class="form-group">
            <label>事业领域</label>
            <textarea data-vision="longTerm.business" placeholder="你想在行业里达到什么位置">${escapeHtml(v.longTerm.business)}</textarea>
          </div>
          <div class="form-group">
            <label>其他</label>
            <textarea data-vision="longTerm.other" placeholder="你还想做的一些事">${escapeHtml(v.longTerm.other)}</textarea>
          </div>
        </div>
      </div>

      <div class="vision-block">
        <div class="vision-block-header">
          <div class="vision-block-title">中期愿景</div>
          <div class="vision-block-desc">未来2-3年你想达到的状态</div>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label>个人领域</label>
            <textarea data-vision="midTerm.personal" placeholder="你想在哪些方面有明显进步">${escapeHtml(v.midTerm.personal)}</textarea>
          </div>
          <div class="form-group">
            <label>事业领域</label>
            <textarea data-vision="midTerm.business" placeholder="你想取得什么阶段性成果">${escapeHtml(v.midTerm.business)}</textarea>
          </div>
          <div class="form-group">
            <label>其他</label>
            <textarea data-vision="midTerm.other" placeholder="你还想做的一些事">${escapeHtml(v.midTerm.other)}</textarea>
          </div>
        </div>
      </div>

      <div class="vision-block">
        <div class="vision-block-header">
          <div class="vision-block-title">一年愿景</div>
          <div class="vision-block-desc"></div>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label>个人领域</label>
            <textarea data-vision="yearOne.personal" placeholder="这一年你想完成什么">${escapeHtml(v.yearOne.personal)}</textarea>
          </div>
          <div class="form-group">
            <label>事业领域</label>
            <textarea data-vision="yearOne.business" placeholder="这一年你想推进到哪一步">${escapeHtml(v.yearOne.business)}</textarea>
          </div>
          <div class="form-group">
            <label>其他</label>
            <textarea data-vision="yearOne.other" placeholder="你还想做的一些事">${escapeHtml(v.yearOne.other)}</textarea>
          </div>
        </div>
      </div>

      <div class="form-group">
        <label>补充笔记</label>
        <textarea data-vision="notes" style="min-height:80px" placeholder="其他想法、灵感、提醒...">${escapeHtml(v.notes)}</textarea>
      </div>

      <button class="btn btn-primary" onclick="saveVision()">保存愿景</button>
    </div>
  `;
}

function saveVision() {
  $$('[data-vision]').forEach(el => {
    const path = el.dataset.vision.split('.');
    let obj = data.vision;
    for (let i = 0; i < path.length - 1; i++) obj = obj[path[i]];
    obj[path[path.length-1]] = el.value;
  });
  saveData();
  toast('愿景已保存');
}

// ════════════════════════════════════════════
// 页面3: 12周计划
// ════════════════════════════════════════════
function renderPlan12() {
  const container = $('#page-plan12');

  let goalsHtml = '';
  if (data.goals.length === 0) {
    goalsHtml = '<div class="empty-state"><p>还没有12周目标</p><p>目标不用多，2-3个足矣。少即是多。</p></div>';
  }

  for (const goal of data.goals) {
    const strategies = goal.strategies || [];
    let strategiesHtml = '';
    for (const s of strategies) {
      strategiesHtml += `
        <div class="list-item">
          <div class="checkbox ${s.completed?'checked':''}" onclick="toggleStrategy('${goal.id}','${s.id}')"></div>
          <div class="list-item-content">
            <div>${escapeHtml(s.text)}</div>
            <div style="margin-top:4px">
              <span class="tag ${s.completed?'tag-success':'tag-info'}">${formatWeeks(s)}</span>
              ${s.completed ? '<span class="tag tag-success" style="margin-left:4px">已完成</span>' : ''}
            </div>
          </div>
          <div class="list-item-actions">
            <button class="btn btn-secondary btn-sm" onclick="editStrategy('${goal.id}','${s.id}')">改</button>
            <button class="btn btn-danger btn-sm" onclick="deleteStrategy('${goal.id}','${s.id}')">删</button>
          </div>
        </div>
      `;
    }

    const totalStrategies = strategies.length;
    const completedStrategies = strategies.filter(s => s.completed).length;

    goalsHtml += `
      <div class="card">
        <div class="card-title">
          目标：${escapeHtml(goal.title)}
          <span class="badge">${completedStrategies}/${totalStrategies} 策略</span>
        </div>
        <div style="margin-bottom:8px;font-size:13px;color:var(--text-secondary)">
          <strong>衡量标准：</strong>${escapeHtml(goal.measurable || '未设定')}
        </div>
        ${goal.deadline ? `<div style="margin-bottom:12px;font-size:13px;color:var(--text-secondary)"><strong>截止：</strong>第${goal.deadline}周</div>` : ''}

        <div class="section-title">策略（以动词开头，标注完成周次）</div>
        ${strategiesHtml}

        <div style="margin-top:12px;display:flex;gap:8px">
          <button class="btn btn-secondary btn-sm" onclick="addStrategy('${goal.id}')">+ 添加策略</button>
          <button class="btn btn-secondary btn-sm" onclick="editGoal('${goal.id}')">编辑目标</button>
          <button class="btn btn-danger btn-sm" onclick="deleteGoal('${goal.id}')">删除目标</button>
        </div>
      </div>
    `;
  }

  container.innerHTML = `
    ${goalsHtml}
    <div class="card" style="border-style:dashed">
      <div class="empty-state">
        <p>添加新的12周目标</p>
        <button class="btn btn-primary" onclick="addGoal()">+ 添加目标</button>
      </div>
    </div>
  `;
}

function addGoal() {
  const modal = createModal('添加12周目标', `
    <div class="form-group">
      <label>目标标题</label>
      <input type="text" id="goal-title" placeholder="如：体脂率降到15%">
    </div>
    <div class="form-group">
      <label>衡量标准（具体可衡量）</label>
      <textarea id="goal-measurable" placeholder="怎么算达成了？量化标准是什么？"></textarea>
    </div>
    <div class="form-group">
      <label>截止周次</label>
      <select id="goal-deadline">
        <option value="">不限定</option>
        ${Array.from({length:12},(_,i)=>`<option value="${i+1}">第${i+1}周</option>`).join('')}
      </select>
    </div>
  `, () => {
    const title = $('#goal-title').value.trim();
    if (!title) { toast('请输入目标标题'); return; }
    data.goals.push({
      id: uid(),
      title,
      measurable: $('#goal-measurable').value.trim(),
      deadline: $('#goal-deadline').value ? parseInt($('#goal-deadline').value) : null,
      strategies: [],
    });
    saveData();
    closeModal();
    renderPlan12();
    toast('目标已添加');
  });
}

function deleteGoal(goalId) {
  if (!confirm('确定删除这个目标及其所有策略？')) return;
  data.goals = data.goals.filter(g => g.id !== goalId);
  saveData();
  renderPlan12();
  toast('目标已删除');
}

function addStrategy(goalId) {
  const modal = createModal('添加策略', `
    <div class="form-group">
      <label>策略描述（以动词开头，完整句子）</label>
      <textarea id="strategy-text" placeholder="如：每周健身4次，每次30分钟"></textarea>
    </div>
    <div class="form-group">
      <label>完成周次（可多选）</label>
      <div style="display:flex;flex-wrap:wrap;gap:6px">
        <button type="button" class="week-chip" data-week="all" onclick="toggleWeekChip(this)">全部</button>
        ${Array.from({length:12},(_,i)=>`<button type="button" class="week-chip" data-week="${i+1}" onclick="toggleWeekChip(this)">W${i+1}</button>`).join('')}
      </div>
      <div id="selected-weeks-display" style="font-size:12px;color:var(--text-secondary);margin-top:4px">未选择</div>
    </div>
  `, () => {
    const text = $('#strategy-text').value.trim();
    if (!text) { toast('请输入策略描述'); return; }
    const goal = data.goals.find(g => g.id === goalId);
    if (!goal) return;
    if (!goal.strategies) goal.strategies = [];
    const selectedWeeks = getSelectedWeeks();
    if (selectedWeeks.length === 0) { toast('请选择完成周次'); return; }
    goal.strategies.push({
      id: uid(),
      text,
      weeks: selectedWeeks,
      completed: false,
    });
    saveData();
    closeModal();
    renderPlan12();
    toast('策略已添加');
  });
}

// Week chip multi-select helpers
function toggleWeekChip(btn) {
  if (btn.dataset.week === 'all') {
    const parent = btn.parentElement;
    const allSelected = btn.classList.contains('active');
    parent.querySelectorAll('.week-chip').forEach(c => {
      if (allSelected) c.classList.remove('active');
      else if (c.dataset.week !== 'all') c.classList.add('active');
    });
    if (!allSelected) btn.classList.add('active');
  } else {
    btn.classList.toggle('active');
    // Update "全部" button state
    const allBtn = btn.parentElement.querySelector('[data-week="all"]');
    const weekBtns = btn.parentElement.querySelectorAll('[data-week]:not([data-week="all"])');
    const allActive = Array.from(weekBtns).every(b => b.classList.contains('active'));
    if (allBtn) allBtn.classList.toggle('active', allActive);
  }
  updateSelectedWeeksDisplay(btn.parentElement);
}

function updateSelectedWeeksDisplay(container) {
  const display = container.parentElement.querySelector('#selected-weeks-display');
  if (!display) return;
  const weeks = getSelectedWeeks(container);
  if (weeks.length === 0) {
    display.textContent = '未选择';
  } else if (weeks.length === 12) {
    display.textContent = '全部周次（1-12周）';
  } else {
    display.textContent = '已选：第' + weeks.sort((a,b)=>a-b).join('、') + '周';
  }
}

function getSelectedWeeks(container) {
  if (!container) {
    // Find the active modal's week chip container
    const modal = document.querySelector('.modal-overlay');
    if (modal) {
      container = modal.querySelector('#edit-week-chips') || modal.querySelector('.week-chip')?.parentElement;
    }
    if (!container) {
      container = document.querySelector('#edit-week-chips') || document.querySelector('.week-chip')?.parentElement;
    }
  }
  if (!container) return [];
  const chips = container.querySelectorAll('.week-chip.active:not([data-week="all"])');
  return Array.from(chips).map(c => parseInt(c.dataset.week));
}

function formatWeeks(s) {
  if (s.weeks && s.weeks.length > 0) {
    if (s.weeks.length === 12) return '全部周次';
    return s.weeks.map(w => 'W' + w).join('、');
  }
  if (s.week) return '第' + s.week + '周';
  return '未设定';
}

function editGoal(goalId) {
  const goal = data.goals.find(g => g.id === goalId);
  if (!goal) return;
  const modal = createModal('编辑目标', `
    <div class="form-group">
      <label>目标标题</label>
      <input id="goal-edit-title" value="${escapeHtml(goal.title)}">
    </div>
    <div class="form-group">
      <label>衡量标准（具体可衡量）</label>
      <input id="goal-edit-measurable" value="${escapeHtml(goal.measurable || '')}">
    </div>
    <div class="form-group">
      <label>截止周次</label>
      <select id="goal-edit-deadline">
        <option value="">无</option>
        ${Array.from({length:12},(_,i)=>`<option value="${i+1}" ${goal.deadline===i+1?'selected':''}>第${i+1}周</option>`).join('')}
      </select>
    </div>
  `, () => {
    const title = $('#goal-edit-title').value.trim();
    if (!title) { toast('请输入目标标题'); return; }
    goal.title = title;
    goal.measurable = $('#goal-edit-measurable').value.trim();
    goal.deadline = $('#goal-edit-deadline').value ? parseInt($('#goal-edit-deadline').value) : null;
    saveData();
    closeModal();
    renderPlan12();
    toast('目标已更新');
  });
}

function editStrategy(goalId, strategyId) {
  const goal = data.goals.find(g => g.id === goalId);
  if (!goal) return;
  const s = (goal.strategies || []).find(s => s.id === strategyId);
  if (!s) return;
  const currentWeeks = s.weeks || (s.week ? [s.week] : []);
  const modal = createModal('编辑策略', `
    <div class="form-group">
      <label>策略描述（以动词开头，完整句子）</label>
      <textarea id="strategy-edit-text">${escapeHtml(s.text)}</textarea>
    </div>
    <div class="form-group">
      <label>完成周次（可多选）</label>
      <div id="edit-week-chips" style="display:flex;flex-wrap:wrap;gap:6px">
        <button type="button" class="week-chip ${currentWeeks.length===12?'active':''}" data-week="all" onclick="toggleWeekChip(this)">全部</button>
        ${Array.from({length:12},(_,i)=>`<button type="button" class="week-chip ${currentWeeks.includes(i+1)?'active':''}" data-week="${i+1}" onclick="toggleWeekChip(this)">W${i+1}</button>`).join('')}
      </div>
      <div id="selected-weeks-display" style="font-size:12px;color:var(--text-secondary);margin-top:4px">${currentWeeks.length===12?'全部周次':currentWeeks.length>0?'已选：第'+currentWeeks.join('、')+'周':'未选择'}</div>
    </div>
  `, () => {
    const text = $('#strategy-edit-text').value.trim();
    if (!text) { toast('请输入策略描述'); return; }
    const selectedWeeks = getSelectedWeeks();
    if (selectedWeeks.length === 0) { toast('请选择完成周次'); return; }
    s.text = text;
    s.weeks = selectedWeeks;
    delete s.week;
    saveData();
    closeModal();
    renderPlan12();
    toast('策略已更新');
  });
}

function deleteStrategy(goalId, strategyId) {
  const goal = data.goals.find(g => g.id === goalId);
  if (!goal) return;
  goal.strategies = (goal.strategies || []).filter(s => s.id !== strategyId);
  saveData();
  renderPlan12();
  toast('策略已删除');
}

function toggleStrategy(goalId, strategyId) {
  const goal = data.goals.find(g => g.id === goalId);
  if (!goal) return;
  const s = (goal.strategies || []).find(s => s.id === strategyId);
  if (!s) return;
  s.completed = !s.completed;
  saveData();
  // 刷新当前页面
  const activeTab = $('.nav-tab.active');
  if (activeTab) switchPage(activeTab.dataset.page);
  updateWeekBar();
}

function toggleExtraTask(weekNum, taskId) {
  const wp = data.weekPlans[weekNum] || (data.weekPlans[weekNum] = { extraTasks: [] });
  const t = (wp.extraTasks || []).find(t => t.id === taskId);
  if (!t) return;
  t.done = !t.done;
  saveData();
  const activeTab = $('.nav-tab.active');
  if (activeTab) switchPage(activeTab.dataset.page);
  updateWeekBar();
}

// ════════════════════════════════════════════
// 页面4: 周计划
// ════════════════════════════════════════════
function renderWeekPlan() {
  const container = $('#page-weekplan');
  const week = data.meta.currentWeek;
  const strategies = getStrategiesForWeek(week);
  const extras = getExtraTasksForWeek(week);

  // 按目标分组策略
  const grouped = {};
  for (const s of strategies) {
    if (!grouped[s.goalId]) grouped[s.goalId] = { title: s.goalTitle, items: [] };
    grouped[s.goalId].items.push(s);
  }

  let strategiesHtml = '';
  if (strategies.length === 0) {
    strategiesHtml = '<div class="empty-state"><p>本周没有从12周计划分配的策略</p><button class="btn btn-primary btn-sm" onclick="switchPage(\'plan12\')">去12周计划添加</button></div>';
  } else {
    for (const goalId in grouped) {
      const g = grouped[goalId];
      let itemsHtml = '';
      for (const s of g.items) {
        itemsHtml += `
          <div class="list-item">
            <div class="checkbox ${s.completed?'checked':''}" onclick="toggleStrategy('${s.goalId}','${s.id}')"></div>
            <div class="list-item-content">
              <div>${escapeHtml(s.text)}</div>
            </div>
          </div>
        `;
      }
      strategiesHtml += `
        <div style="margin-bottom:16px">
          <div class="section-title">${escapeHtml(g.title)}</div>
          ${itemsHtml}
        </div>
      `;
    }
  }

  let extrasHtml = '';
  for (const t of extras) {
    extrasHtml += `
      <div class="list-item">
        <div class="checkbox ${t.done?'checked':''}" onclick="toggleExtraTask(${week},'${t.id}')"></div>
        <div class="list-item-content"><div>${escapeHtml(t.text)}</div></div>
        <div class="list-item-actions">
          <button class="btn btn-danger btn-sm" onclick="deleteExtraTask(${week},'${t.id}')">删</button>
        </div>
      </div>
    `;
  }

  const completion = calculateWeekCompletion(week);

  container.innerHTML = `
    <div class="card">
      <div class="card-title">第${week}周计划 <span class="badge">从12周计划自动提取</span></div>
      ${completion ? `
        <div style="display:flex;align-items:center;gap:12px;margin-bottom:16px">
          <span>本周完成率:</span>
          <span class="rate-value ${completion.rate>=85?'rate-good':completion.rate>=60?'rate-warn':'rate-poor'}" style="font-size:20px">${completion.rate}%</span>
          <span style="color:var(--text-light)">(${completion.completed}/${completion.total})</span>
          <div class="progress-bar" style="flex:1;max-width:200px">
            <div class="progress-bar-fill ${completion.rate>=85?'':completion.rate>=60?'warning':'danger'}" style="width:${completion.rate}%"></div>
          </div>
        </div>
      ` : ''}

      ${strategiesHtml}
    </div>

    <div class="card">
      <div class="card-title">本周额外任务 <span class="badge">临时添加</span></div>
      ${extrasHtml || '<div class="empty-state" style="padding:16px"><p>暂无额外任务</p></div>'}
      <button class="btn btn-secondary btn-sm" onclick="addExtraTask(${week})">+ 添加额外任务</button>
    </div>
  `;
}

function addExtraTask(weekNum) {
  const modal = createModal('添加额外任务', `
    <div class="form-group">
      <label>任务描述</label>
      <input type="text" id="extra-task-text" placeholder="本周需要做的临时任务">
    </div>
  `, () => {
    const text = $('#extra-task-text').value.trim();
    if (!text) { toast('请输入任务描述'); return; }
    if (!data.weekPlans[weekNum]) data.weekPlans[weekNum] = { extraTasks: [] };
    if (!data.weekPlans[weekNum].extraTasks) data.weekPlans[weekNum].extraTasks = [];
    data.weekPlans[weekNum].extraTasks.push({ id: uid(), text, done: false });
    saveData();
    closeModal();
    renderWeekPlan();
    updateWeekBar();
    toast('任务已添加');
  });
}

function deleteExtraTask(weekNum, taskId) {
  const wp = data.weekPlans[weekNum];
  if (!wp || !wp.extraTasks) return;
  wp.extraTasks = wp.extraTasks.filter(t => t.id !== taskId);
  saveData();
  renderWeekPlan();
  updateWeekBar();
}

// ════════════════════════════════════════════
// 页面5: 每日打勾
// ════════════════════════════════════════════
function renderDaily() {
  const container = $('#page-daily');
  const week = data.meta.currentWeek;
  const today = new Date().toISOString().slice(0,10);

  const strategies = getStrategiesForWeek(week);
  const extras = getExtraTasksForWeek(week);

  // 7天打勾表
  const dayNames = ['周一','周二','周三','周四','周五','周六','周日'];
  let daysHtml = '';

  for (let day = 1; day <= 7; day++) {
    const key = `${week}-${day}`;
    const dc = data.dailyChecks[key] || { checks: {} };

    let itemsHtml = '';
    if (strategies.length === 0 && extras.length === 0) {
      itemsHtml = '<div style="color:var(--text-light);padding:8px 0">本周无任务</div>';
    } else {
      for (const s of strategies) {
        const checked = dc.checks[s.id] || false;
        itemsHtml += `
          <div style="display:flex;align-items:center;gap:8px;padding:4px 0">
            <div class="checkbox ${checked?'checked':''}" style="width:18px;height:18px" onclick="toggleDailyCheck('${key}','${s.id}')"></div>
            <span style="font-size:13px;${checked?'color:var(--text-light);text-decoration:line-through':''}">${escapeHtml(s.text)}</span>
          </div>
        `;
      }
      for (const t of extras) {
        const checked = dc.checks[t.id] || false;
        itemsHtml += `
          <div style="display:flex;align-items:center;gap:8px;padding:4px 0">
            <div class="checkbox ${checked?'checked':''}" style="width:18px;height:18px" onclick="toggleDailyCheck('${key}','${t.id}')"></div>
            <span style="font-size:13px;${checked?'color:var(--text-light);text-decoration:line-through':''}">${escapeHtml(t.text)}</span>
          </div>
        `;
      }
    }

    // 计算当日完成率
    const totalItems = strategies.length + extras.length;
    const checkedItems = totalItems ? Object.values(dc.checks).filter(Boolean).length : 0;
    const dayRate = totalItems ? Math.round(checkedItems/totalItems*100) : 0;

    daysHtml += `
      <div class="card" style="margin-bottom:8px">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
          <strong>${dayNames[day-1]}</strong>
          <span class="tag ${dayRate>=85?'tag-success':dayRate>0?'tag-warning':'tag-default'}">${checkedItems}/${totalItems}</span>
        </div>
        ${itemsHtml}
      </div>
    `;
  }

  container.innerHTML = `
    <div class="card" style="background:var(--accent-light);border-color:var(--accent)">
      <p style="font-size:13px;color:var(--text-secondary)">
        <strong>第${week}周 · 每日打勾表</strong><br>
        每天打开看看今天该做什么，做完打勾。不是写日记，是打勾——做了就是做了，没做就是没做。
      </p>
    </div>
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:8px">
      ${daysHtml}
    </div>
  `;
}

function toggleDailyCheck(key, itemId) {
  if (!data.dailyChecks[key]) data.dailyChecks[key] = { checks: {} };
  data.dailyChecks[key].checks[itemId] = !data.dailyChecks[key].checks[itemId];
  saveData();
  renderDaily();
}

// ════════════════════════════════════════════
// 页面6: 周量评
// ════════════════════════════════════════════
function renderReview() {
  const container = $('#page-review');
  const week = data.meta.currentWeek;
  const completion = calculateWeekCompletion(week);
  const review = data.weeklyReviews[week] || { uncompletedReasons: {}, adjustments: '', done: false };

  // 找未完成的策略（与calculateWeekCompletion逻辑一致）
  const strategies = getStrategiesForWeek(week);
  const extras = getExtraTasksForWeek(week);
  
  function isItemCompleted(item) {
    // 检查每日打勾
    for (let day = 1; day <= 7; day++) {
      const key = week + '-' + day;
      const dc = data.dailyChecks[key];
      if (dc && dc.checks && dc.checks[item.id]) return true;
    }
    // 检查全局完成状态
    return item.completed || item.done || false;
  }
  
  const uncompleted = [
    ...strategies.filter(s => !isItemCompleted(s)).map(s => ({ id: s.id, text: s.text, type: 'strategy' })),
    ...extras.filter(t => !isItemCompleted(t)).map(t => ({ id: t.id, text: t.text, type: 'task' })),
  ];

  let uncompletedHtml = '';
  if (uncompleted.length === 0) {
    uncompletedHtml = '<div class="empty-state" style="padding:16px"><p>全部完成！干得漂亮。</p></div>';
  } else {
    for (const item of uncompleted) {
      const reason = (review.uncompletedReasons || {})[item.id] || '';
      uncompletedHtml += `
        <div class="list-item" style="flex-direction:column;align-items:stretch">
          <div style="margin-bottom:8px">${escapeHtml(item.text)}</div>
          <input type="text" data-reason="${item.id}" placeholder="没完成的原因是什么？" value="${escapeHtml(reason)}" style="font-size:13px">
        </div>
      `;
    }
  }

  const rate = completion ? completion.rate : 0;
  const rateClass = rate >= 85 ? 'rate-good' : rate >= 60 ? 'rate-warn' : 'rate-poor';
  const statusText = rate >= 85 ? '达标（85%以上）' : rate >= 60 ? '接近达标，继续努力' : '需要调整，下周加油';

  container.innerHTML = `
    <div class="card">
      <div class="card-title">第${week}周量评卡</div>

      <div style="text-align:center;padding:20px 0;border-bottom:1px solid var(--border);margin-bottom:16px">
        <div class="rate-value ${rateClass}" style="font-size:48px">${rate}%</div>
        <div style="color:var(--text-secondary);margin-top:4px">${statusText}</div>
        ${completion ? `<div style="color:var(--text-light);margin-top:4px;font-size:13px">${completion.completed}/${completion.total} 项完成</div>` : ''}
      </div>

      <div class="section-title">未完成项及原因</div>
      ${uncompletedHtml}

      <div class="section-title" style="margin-top:16px">下周调整方向</div>
      <textarea id="review-adjustments" style="min-height:80px" placeholder="基于本周的执行情况，下周需要怎么调整？">${escapeHtml(review.adjustments || '')}</textarea>

      <div style="margin-top:16px;display:flex;gap:8px">
        <button class="btn btn-primary" onclick="saveReview(${week})">保存量评</button>
      </div>
    </div>

    <div class="card">
      <div class="card-title">12周完成率总览</div>
      <div style="display:flex;gap:4px;flex-wrap:wrap">
        ${Array.from({length:12},(_,i)=>{
          const c = calculateWeekCompletion(i+1);
          const r = c ? c.rate : null;
          const cls = r === null ? 'tag-default' : r >= 85 ? 'tag-success' : r >= 60 ? 'tag-warning' : 'tag-danger';
          return `<span class="tag ${cls}" style="min-width:60px;text-align:center;padding:6px 8px">${i+1===week?'▶ ':''}W${i+1} ${r!==null?r+'%':'—'}</span>`;
        }).join('')}
      </div>
    </div>
  `;
}

function saveReview(week) {
  const reasons = {};
  $$('[data-reason]').forEach(el => {
    reasons[el.dataset.reason] = el.value;
  });
  data.weeklyReviews[week] = {
    uncompletedReasons: reasons,
    adjustments: $('#review-adjustments').value,
    done: true,
    savedAt: new Date().toISOString(),
  };
  saveData();
  toast('量评已保存');
}

// ════════════════════════════════════════════
// 页面7: 时间块
// ════════════════════════════════════════════
function renderTimeBlock() {
  const container = $('#page-timeblock');
  const week = data.meta.currentWeek;
  const blocks = data.timeBlocks[week] || {};

  const dayNames = ['周一','周二','周三','周四','周五','周六','周日'];
  const blockTypes = [
    { key: 'strategy', label: '策略块', desc: '长时间进入心流状态，做最重要的事', cls: 'block-strategy' },
    { key: 'execution', label: '执行块', desc: '按小时切换，处理必须交付的事', cls: 'block-execution' },
    { key: 'buffer', label: '缓冲块', desc: '集中处理碎事，不打断其他块', cls: 'block-buffer' },
    { key: 'break', label: '休息块', desc: '主动恢复精力，保持最佳状态', cls: 'block-break' },
  ];

  let daysHtml = '';
  for (let d = 0; d < 7; d++) {
    const dayKey = ['mon','tue','wed','thu','fri','sat','sun'][d];
    const dayBlocks = blocks[dayKey] || [];

    let blocksHtml = '';
    if (dayBlocks.length === 0) {
      blocksHtml = '<div style="color:var(--text-light);font-size:13px;padding:8px 0">未设定</div>';
    } else {
      for (const b of dayBlocks) {
        const typeInfo = blockTypes.find(t => t.key === b.type) || blockTypes[0];
        blocksHtml += `
          <div class="timeblock-cell ${typeInfo.cls}" style="margin-bottom:4px">
            <div style="display:flex;justify-content:space-between;align-items:center">
              <span><strong>${b.start}-${b.end}</strong> ${typeInfo.label}</span>
              <button class="btn btn-danger btn-sm" onclick="deleteTimeBlock(${week},'${dayKey}','${b.id}')">删</button>
            </div>
            ${b.note ? `<div style="font-size:12px;color:var(--text-secondary);margin-top:2px">${escapeHtml(b.note)}</div>` : ''}
          </div>
        `;
      }
    }

    daysHtml += `
      <div class="card" style="margin-bottom:8px">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
          <strong>${dayNames[d]}</strong>
          <button class="btn btn-secondary btn-sm" onclick="addTimeBlock(${week},'${dayKey}')">+ 添加时间块</button>
        </div>
        ${blocksHtml}
      </div>
    `;
  }

  container.innerHTML = `
    <div class="card" style="background:var(--accent-light);border-color:var(--accent)">
      <p style="font-size:13px;color:var(--text-secondary)">
        <strong>时间块系统</strong><br>
        把一天分成四块：策略块（长时间进入心流状态，做最重要的事）、执行块（按小时切换，处理必须交付的事）、缓冲块（集中处理碎事，不打断其他块）、休息块（主动恢复精力，保持最佳状态）。四块咬合，该投入时投入，该进入心流时进入，该休息时休息。节奏一旦建立，习惯系统就能接管。
      </p>
    </div>
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:8px">
      ${daysHtml}
    </div>
    <div class="card">
      <button class="btn btn-secondary btn-sm" onclick="copyWeekTemplate(${week})">复制本周模板到下周</button>
    </div>
  `;
}

function addTimeBlock(week, dayKey) {
  const modal = createModal('添加时间块', `
    <div class="form-row">
      <div class="form-group">
        <label>开始时间</label>
        <input type="text" id="tb-start" placeholder="如 09:00">
      </div>
      <div class="form-group">
        <label>结束时间</label>
        <input type="text" id="tb-end" placeholder="如 12:00">
      </div>
    </div>
    <div class="form-group">
      <label>类型</label>
      <select id="tb-type">
        <option value="strategy">策略块（长时间进入心流状态，做最重要的事）</option>
        <option value="execution">执行块（按小时切换，处理必须交付的事）</option>
        <option value="buffer">缓冲块（集中处理碎事，不打断其他块）</option>
        <option value="break">休息块（主动恢复精力，保持最佳状态）</option>
      </select>
    </div>
    <div class="form-group">
      <label>备注</label>
      <input type="text" id="tb-note" placeholder="可选">
    </div>
  `, () => {
    const start = $('#tb-start').value.trim();
    const end = $('#tb-end').value.trim();
    if (!start || !end) { toast('请填写时间'); return; }
    if (!data.timeBlocks[week]) data.timeBlocks[week] = {};
    if (!data.timeBlocks[week][dayKey]) data.timeBlocks[week][dayKey] = [];
    data.timeBlocks[week][dayKey].push({
      id: uid(),
      start, end,
      type: $('#tb-type').value,
      note: $('#tb-note').value.trim(),
    });
    saveData();
    closeModal();
    renderTimeBlock();
    toast('时间块已添加');
  });
}

function deleteTimeBlock(week, dayKey, blockId) {
  data.timeBlocks[week][dayKey] = data.timeBlocks[week][dayKey].filter(b => b.id !== blockId);
  saveData();
  renderTimeBlock();
}

function copyWeekTemplate(fromWeek) {
  const toWeek = fromWeek + 1;
  if (toWeek > 12) { toast('已是第12周'); return; }
  if (data.timeBlocks[fromWeek]) {
    // 深拷贝并重新生成id
    const copied = {};
    for (const day in data.timeBlocks[fromWeek]) {
      copied[day] = data.timeBlocks[fromWeek][day].map(b => ({ ...b, id: uid() }));
    }
    data.timeBlocks[toWeek] = copied;
    saveData();
    toast(`已复制到第${toWeek}周`);
  } else {
    toast('本周没有时间块可复制');
  }
}

// ── 模态框 ──────────────────────────────────
function createModal(title, bodyHtml, onConfirm) {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay active';
  overlay.innerHTML = `
    <div class="modal">
      <div class="modal-title">${title}</div>
      ${bodyHtml}
      <div class="modal-actions">
        <button class="btn btn-secondary" id="modal-cancel">取消</button>
        <button class="btn btn-primary" id="modal-confirm">确认</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  $('#modal-cancel').onclick = () => closeModal(overlay);
  $('#modal-confirm').onclick = () => { if (onConfirm) onConfirm(); };
  overlay.addEventListener('click', e => { if (e.target === overlay) closeModal(overlay); });
  return overlay;
}

function closeModal(overlay) {
  if (overlay) overlay.remove();
  else $('.modal-overlay.active')?.remove();
}

// ── 导出/导入 ──────────────────────────────────
function exportData() {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `12周执行系统_导出_${new Date().toISOString().slice(0,10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
  toast('数据已导出');
}

function importData(file) {
  const reader = new FileReader();
  reader.onload = e => {
    try {
      const imported = JSON.parse(e.target.result);
      data = deepMerge(JSON.parse(JSON.stringify(DEFAULT_DATA)), imported);
      saveData();
      initWeekSelect();
      switchPage('dashboard');
      toast('数据已导入');
    } catch (err) {
      toast('导入失败：文件格式错误');
    }
  };
  reader.readAsText(file);
}

// ── 初始化 ──────────────────────────────────
function init() {
  // 首次使用记录时间
  if (!data.meta.createdAt) {
    data.meta.createdAt = new Date().toISOString();
    saveData();
  }

  // 导航绑定
  $$('.nav-tab').forEach(tab => {
    tab.addEventListener('click', () => switchPage(tab.dataset.page));
  });

  // 导出导入
  $('#btn-export').addEventListener('click', exportData);
  $('#btn-import').addEventListener('click', () => $('#import-file').click());
  $('#import-file').addEventListener('change', e => {
    if (e.target.files[0]) importData(e.target.files[0]);
    e.target.value = '';
  });

  // 周次选择
  initWeekSelect();

  // 默认渲染看板
  renderDashboard();
}

document.addEventListener('DOMContentLoaded', init);
