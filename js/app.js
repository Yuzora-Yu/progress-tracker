// Progress Tracker v2.4 — fixed chart sizing, reordered report (badges → diff → chart), goal comparisons, X posts
document.addEventListener('DOMContentLoaded', () => {
  const KEY = 'progress-tracker-v2';

  // ---------- helpers ----------
  const $ = (id) => document.getElementById(id);
  const todayISO = () => new Date(Date.now() - new Date().getTimezoneOffset()*60000).toISOString().slice(0,10);
  const iso = (d) => new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,10);
  const addDays = (d,n)=>{ const t=new Date(d); t.setDate(t.getDate()+n); return iso(t); };
  const clamp = (v,min,max)=>Math.max(min,Math.min(max,v));
  const escapeHtml = (s)=> s.replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  const uid = () => Math.random().toString(36).slice(2,10);
  const safeOn = (el, ev, fn) => el && el.addEventListener(ev, fn);

  const downloadJSON = (filename, obj) => {
    const blob = new Blob([JSON.stringify(obj, null, 2)], {type:'application/json'});
    const url = URL.createObjectURL(blob);
    const a = Object.assign(document.createElement('a'), {href:url, download:filename});
    a.click(); URL.revokeObjectURL(url);
  };
  const readJSONFile = (file) => new Promise((res,rej)=>{
    const fr=new FileReader();
    fr.onload=()=>{ try{res(JSON.parse(fr.result))}catch(e){rej(e)} };
    fr.onerror=rej; fr.readAsText(file,'utf-8');
  });

  // ---------- state ----------
  const defaultData = () => ({
    version: 3,
    profile: {
      goalTitle:'今年の進捗',
      goalDesc:'',
      startDate:todayISO(),
      currentValue:null,
      goalValue:100,
      unit:'pt',
      goalDir:'gte'
    },
    tasks: [],
    records: {},
    goalProgress: {},
    weights: { S:1.3, A:1.15, B:1, C:0.85, D:0.7 }
  });
  const loadAll = () => { try{ const r=localStorage.getItem(KEY); return r? JSON.parse(r) : null; }catch{ return null; }};
  const saveAll = (d) => localStorage.setItem(KEY, JSON.stringify(d));

  let data = loadAll() ?? defaultData();
  if (!data.tasks || data.tasks.length===0) {
    data.tasks = [
      { id: uid(), title:'サンプル：運動', targetPerDay:1, priority:'A' },
      { id: uid(), title:'サンプル：学習', targetPerDay:1, priority:'B' }
    ];
  }
  if (data.profile && data.profile.currentValue === undefined) data.profile.currentValue = null;
  saveAll(data);

  // ---------- DOM refs ----------
  const els = {
    goalTitle: $('goalTitle'), goalDesc: $('goalDesc'),
    startDate: $('startDate'), goalDir: $('goalDir'),
    currentValue: $('currentValue'), goalValue: $('goalValue'), unit: $('unit'),
    saveProfile: $('saveProfile'), profileSaved: $('profileSaved'),

    taskList: $('taskList'), addTask: $('addTask'), weightEditor: $('weightEditor'),
    downloadTemplate: $('downloadTemplate'), uploadTemplate: $('uploadTemplate'),

    recDate: $('recDate'), copyPrev: $('copyPrev'), clearToday: $('clearToday'),
    goalProgress: $('goalProgress'),
    recordInputs: $('recordInputs'), saveRecord: $('saveRecord'), recordSaved: $('recordSaved'),

    chartRangeBtns: Array.from(document.querySelectorAll('.chartRange')), dailyChart: $('dailyChart'),
    makeCard: $('makeCard'), dlCard: $('dlCard'), resultCard: $('resultCard'), postDaily: $('postDaily'),

    challengeStart: $('challengeStart'), calc30: $('calc30'), calc100: $('calc100'), challengeResult: $('challengeResult'),
    postChallenge: $('postChallenge'),

    downloadBackup: $('downloadBackup'), uploadBackup: $('uploadBackup')
  };

  // ---------- profile ----------
  function hydrateProfile(){
    if(!els.goalTitle) return;
    const p = data.profile ?? {};
    els.goalTitle.value = p.goalTitle ?? '';
    els.goalDesc.value  = p.goalDesc ?? '';
    els.startDate.value = p.startDate ?? todayISO();
    els.currentValue.value = (p.currentValue ?? '') === null ? '' : p.currentValue;
    els.goalValue.value = p.goalValue ?? 0;
    els.unit.value      = p.unit ?? '';
    if(els.goalDir) els.goalDir.value = p.goalDir ?? 'gte';
    if(els.challengeStart) els.challengeStart.value = p.startDate ?? todayISO();
  }

  safeOn(els.saveProfile,'click',()=>{
    data.profile = {
      goalTitle: (els.goalTitle?.value || '今年の進捗').trim(),
      goalDesc:  (els.goalDesc?.value || '').trim(),
      startDate: els.startDate?.value || todayISO(),
      currentValue: (els.currentValue?.value === '' ? null : Number(els.currentValue.value)),
      goalValue: Number(els.goalValue?.value) || 0,
      unit:      (els.unit?.value || '').trim(),
      goalDir:   els.goalDir?.value || 'gte'
    };
    saveAll(data);
    if(els.profileSaved){ els.profileSaved.textContent='保存しました'; setTimeout(()=> els.profileSaved.textContent='', 1400); }
  });

  // ---------- tasks ----------
  function renderTasks(){
    if(!els.taskList) return;
    els.taskList.innerHTML = `
      <div class="task muted">
        <strong>タスク名</strong>
        <span>1日の目標回数（任意）</span>
        <span>重要度</span>
        <span>操作</span>
      </div>
      ${data.tasks.map(t => `
        <div class="task" data-id="${t.id}">
          <input class="t-title" type="text" value="${escapeHtml(t.title)}" placeholder="例：ランニング">
          <input class="t-target" type="number" step="0.01" min="0" value="${t.targetPerDay ?? ''}">
          <select class="t-priority">
            ${['S','A','B','C','D'].map(k=>`<option ${t.priority===k?'selected':''}>${k}</option>`).join('')}
          </select>
          <button class="del" type="button">削除</button>
        </div>
      `).join('')}
    `;
    els.taskList.querySelectorAll('.task').forEach(row=>{
      const id = row.getAttribute('data-id'); if(!id) return;
      row.querySelector('.t-title')?.addEventListener('input', e=>{
        const t = data.tasks.find(x=>x.id===id); if(!t) return; t.title = e.target.value; saveAll(data);
        renderRecordInputs(); drawChart();
      });
      row.querySelector('.t-target')?.addEventListener('input', e=>{
        const v = e.target.value === '' ? null : Number(e.target.value);
        const t = data.tasks.find(x=>x.id===id); if(!t) return; t.targetPerDay = (v==null || isNaN(v)) ? null : v; saveAll(data);
        drawChart();
      });
      row.querySelector('.t-priority')?.addEventListener('change', e=>{
        const t = data.tasks.find(x=>x.id===id); if(!t) return; t.priority = e.target.value; saveAll(data);
        drawChart();
      });
      row.querySelector('.del')?.addEventListener('click', ()=>{
        data.tasks = data.tasks.filter(x=>x.id!==id);
        for(const d in data.records){ delete data.records[d][id]; }
        saveAll(data); renderTasks(); renderRecordInputs(); drawChart();
      });
    });

    if(els.weightEditor){
      els.weightEditor.innerHTML = Object.entries(data.weights || {}).map(([k,v])=>`
        <label>${k}
          <input data-k="${k}" class="w-edit" type="number" step="0.01" value="${v}">
        </label>`).join('');
      els.weightEditor.querySelectorAll('.w-edit').forEach(inp=>{
        inp.addEventListener('input', e=>{
          const k = e.target.getAttribute('data-k'); const num = Number(e.target.value);
          if(!isNaN(num)){ data.weights[k]=num; saveAll(data); drawChart(); }
        });
      });
    }
  }

  safeOn(els.addTask,'click',()=>{
    data.tasks.push({ id: uid(), title:'新しいタスク', targetPerDay:null, priority:'B' });
    saveAll(data); renderTasks(); renderRecordInputs();
  });

  safeOn(els.downloadTemplate,'click',()=>{
    const tpl = { version:data.version, profile:data.profile, tasks:data.tasks, weights:data.weights };
    downloadJSON('template.json', tpl);
  });
  safeOn(els.uploadTemplate,'change', async (e)=>{
    const f = e.target.files?.[0]; if(!f) return;
    try{
      const tpl = await readJSONFile(f);
      if(!tpl.profile || !Array.isArray(tpl.tasks)) throw new Error('テンプレ形式が不正です');
      data.profile = Object.assign(data.profile, tpl.profile);
      data.tasks   = tpl.tasks;
      data.weights = tpl.weights ?? data.weights;
      saveAll(data);
      hydrateProfile(); renderTasks(); renderRecordInputs(); drawChart();
      alert('テンプレートを読み込みました。');
    }catch(err){ alert('読み込みエラー: '+ err.message); }
    e.target.value='';
  });

  // ---------- records ----------
  function renderRecordInputs(){
    if(!els.recordInputs) return;
    const day = els.recDate?.value || todayISO();
    const rec = data.records[day] ?? {};
    if(els.goalProgress){
      const gp = data.goalProgress[day];
      els.goalProgress.value = (gp ?? '');
    }
    els.recordInputs.innerHTML = data.tasks.length
      ? `<h3 class="muted small" style="margin-top:0">タスク実績</h3>` +
        data.tasks.map(t => `
          <label>
            ${escapeHtml(t.title)}
            <input data-id="${t.id}" class="rec" type="number" step="0.01" min="0" value="${rec[t.id] ?? ''}" placeholder="実績">
          </label>`).join('')
      : `<p class="muted">タスクが未登録です。「日々のタスク定義」から追加してください。</p>`;
    els.recordInputs.querySelectorAll('.rec').forEach(inp=>{
      inp.addEventListener('input', e=>{
        const id = e.target.getAttribute('data-id');
        const v = e.target.value === '' ? null : Number(e.target.value);
        data.records[day] = data.records[day] ?? {};
        if (v==null || isNaN(v)) delete data.records[day][id];
        else data.records[day][id]=v;
        saveAll(data);
      });
    });
  }

  if(els.recDate) els.recDate.value = todayISO();
  safeOn(els.recDate,'change', ()=> renderRecordInputs());
  safeOn(els.copyPrev,'click',()=>{
    const day = els.recDate?.value || todayISO();
    const prev = addDays(new Date(day), -1);
    const src = data.records[prev] ?? {};
    const gp  = data.goalProgress[prev];
    if(!Object.keys(src).length && gp==null){ alert('前日の記録がありません'); return; }
    if(Object.keys(src).length) data.records[day] = { ...src };
    if(gp!=null) data.goalProgress[day] = gp;
    saveAll(data); renderRecordInputs();
  });
  safeOn(els.clearToday,'click',()=>{
    const day = els.recDate?.value || todayISO();
    delete data.records[day];
    delete data.goalProgress[day];
    saveAll(data); renderRecordInputs();
  });
  safeOn(els.saveRecord,'click',()=>{
    const day = els.recDate?.value || todayISO();
    const gv = els.goalProgress?.value;
    if(gv === '' || isNaN(Number(gv))) delete data.goalProgress[day];
    else data.goalProgress[day] = Number(gv);
    const obj = data.records[day] ?? {};
    for(const k of Object.keys(obj)){ if (obj[k]==null || isNaN(obj[k])) delete obj[k]; }
    if (Object.keys(obj).length===0) delete data.records[day]; else data.records[day]=obj;
    saveAll(data);
    if(els.recordSaved){ els.recordSaved.textContent='保存しました'; setTimeout(()=> els.recordSaved.textContent='', 1400); }
    drawChart();
  });

  // ---------- scoring ----------
  function dailyScore(dateISO){
    const rec = data.records[dateISO] ?? {};
    let total = 0, max = 0;
    for(const t of data.tasks){
      const actual = Number(rec[t.id] ?? 0);
      const weight = (data.weights || {})[t.priority] ?? 1;
      const target = (t.targetPerDay ?? 0);
      const rate = target > 0 ? Math.min(actual / target, 1) : (actual>0 ? 1 : 0);
      total += rate * weight; max += 1 * weight;
    }
    return { rate: max>0 ? total/max : 0 };
  }

  function latestProgressISO(){
    const keys = Object.keys(data.goalProgress || {}).sort();
    for(let i=keys.length-1;i>=0;i--){ if(keys[i] <= todayISO()) return keys[i]; }
    return null;
  }
  function latestProgressValue(){
    const k = latestProgressISO(); return k ? data.goalProgress[k] : null;
  }

  // ---------- chart ----------
  let chartDays = 30;
  (els.chartRangeBtns||[]).forEach(btn=>{
    btn.addEventListener('click', ()=>{
      (els.chartRangeBtns||[]).forEach(b=>b.classList.remove('is-active'));
      btn.classList.add('is-active');
      chartDays = Number(btn.dataset.days);
      drawChart();
    });
  });

  function drawChart(){
    if(!els.dailyChart) return;
    const canvas = els.dailyChart;
    const ctx = canvas.getContext('2d', { alpha:false });
    const dpr = window.devicePixelRatio || 1;

    // ▼▼ 縦に拡大する不具合への完全対策 ▼▼
    const hCSS = (canvas.getAttribute('height')|0) || 180; // 論理高さ(px)
    const wCSS = canvas.clientWidth || canvas.parentElement.clientWidth || 600;

    // 物理解像度を都度リセット
    canvas.width  = Math.max(320, Math.floor(wCSS * dpr));
    canvas.height = Math.floor(hCSS * dpr);

    // スタイル高さも固定（ブラウザ差対策）
    canvas.style.height = hCSS + 'px';

    // transformを必ず初期化（スケール累積阻止）
    ctx.setTransform(1,0,0,1,0,0);
    ctx.scale(dpr, dpr);
    // ▲▲ ここまで ▲▲

    const w = Math.floor(canvas.width / dpr);
    const h = Math.floor(canvas.height / dpr);

    // 背景
    ctx.clearRect(0,0,w,h);
    ctx.fillStyle = '#0e1420';
    ctx.fillRect(0,0,w,h);

    // データ
    const end = new Date();
    const dates = [];
    for(let i=chartDays-1;i>=0;i--) dates.push( iso(new Date(end.getTime() - i*86400000)) );
    const rates = dates.map(d => dailyScore(d).rate);

    // 余白
    const padL = 36, padR = 16, padT = 14, padB = 28;
    const innerW = w - (padL + padR);
    const innerH = h - (padT + padB);

    // 軸
    ctx.strokeStyle =
