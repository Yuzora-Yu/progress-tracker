// === Progress Tracker MVP (no backend) ==========================
(() => {
  const KEY = 'progress-tracker-v1';

  // ---- 初期データ ----
  const todayISO = () =>
    new Date(Date.now() - new Date().getTimezoneOffset()*60000).toISOString().slice(0,10);
  const defaultData = () => ({
    version: 1,
    profile: {
      goalTitle: '今年の進捗',
      goalDesc: '',
      goalValue: 100,
      unit: 'pt',
      startDate: todayISO()
    },
    tasks: [
      { id: uid(), title: 'サンプル：運動', targetPerDay: 1, priority: 'A' },
      { id: uid(), title: 'サンプル：学習', targetPerDay: 1, priority: 'B' }
    ],
    records: {}, // { 'YYYY-MM-DD': { [taskId]: number } }
    weights: { S: 1.3, A: 1.15, B: 1, C: 0.85, D: 0.7 }
  });

  // ---- ユーティリティ ----
  function uid() { return Math.random().toString(36).slice(2,9); }
  function saveAll(data) { localStorage.setItem(KEY, JSON.stringify(data)); }
  function loadAll() { const raw = localStorage.getItem(KEY); return raw ? JSON.parse(raw) : null; }
  function downloadJSON(filename, obj) {
    const blob = new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = Object.assign(document.createElement('a'), { href: url, download: filename });
    a.click(); URL.revokeObjectURL(url);
  }
  function readJSONFile(file) {
    return new Promise((res, rej) => {
      const fr = new FileReader();
      fr.onload = () => { try { res(JSON.parse(fr.result)); } catch(e){ rej(e); } };
      fr.onerror = rej; fr.readAsText(file, 'utf-8');
    });
  }
  function clamp(v, min, max){ return Math.max(min, Math.min(max, v)); }
  function addDays(d, n){ const dt=new Date(d); dt.setDate(dt.getDate()+n); return iso(dt); }
  function iso(d){ return new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,10); }
  function escapeHtml(s){ return s.replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m])); }

  // ---- アプリ状態 ----
  let data = loadAll() ?? defaultData();
  saveAll(data); // 初回保存

  // ---- DOM 参照 ----
  const els = {
    goalTitle: document.getElementById('goalTitle'),
    goalDesc: document.getElementById('goalDesc'),
    goalValue: document.getElementById('goalValue'),
    unit: document.getElementById('unit'),
    startDate: document.getElementById('startDate'),
    saveProfile: document.getElementById('saveProfile'),
    profileSaved: document.getElementById('profileSaved'),

    taskList: document.getElementById('taskList'),
    addTask: document.getElementById('addTask'),
    weightEditor: document.getElementById('weightEditor'),

    downloadTemplate: document.getElementById('downloadTemplate'),
    uploadTemplate: document.getElementById('uploadTemplate'),

    recDate: document.getElementById('recDate'),
    copyPrev: document.getElementById('copyPrev'),
    clearToday: document.getElementById('clearToday'),
    recordInputs: document.getElementById('recordInputs'),
    saveRecord: document.getElementById('saveRecord'),
    recordSaved: document.getElementById('recordSaved'),

    chartRangeBtns: Array.from(document.querySelectorAll('.chartRange')),
    dailyChart: document.getElementById('dailyChart'),

    challengeStart: document.getElementById('challengeStart'),
    calc30: document.getElementById('calc30'),
    calc100: document.getElementById('calc100'),
    challengeResult: document.getElementById('challengeResult'),

    makeCard: document.getElementById('makeCard'),
    dlCard: document.getElementById('dlCard'),
    resultCard: document.getElementById('resultCard'),

    downloadBackup: document.getElementById('downloadBackup'),
    uploadBackup: document.getElementById('uploadBackup'),
  };

  // ---- 初期UI反映 ----
  function hydrateProfile(){
    const p = data.profile;
    els.goalTitle.value = p.goalTitle ?? '';
    els.goalDesc.value = p.goalDesc ?? '';
    els.goalValue.value = p.goalValue ?? 0;
    els.unit.value = p.unit ?? '';
    els.startDate.value = p.startDate ?? todayISO();
    els.challengeStart.value = p.startDate ?? todayISO();
  }

  function renderTasks(){
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
            ${['S','A','B','C','D'].map(k => `<option ${t.priority===k?'selected':''}>${k}</option>`).join('')}
          </select>
          <button class="del">削除</button>
        </div>
      `).join('')}
    `;
    // 行イベント
    els.taskList.querySelectorAll('.task').forEach(row => {
      const id = row.dataset.id; if(!id) return;
      row.querySelector('.t-title').addEventListener('input', e=>{
        const t = data.tasks.find(x=>x.id===id); t.title = e.target.value; saveAll(data);
        renderRecordInputs(); drawChart();
      });
      row.querySelector('.t-target').addEventListener('input', e=>{
        const v = e.target.value === '' ? null : Number(e.target.value);
        const t = data.tasks.find(x=>x.id===id); t.targetPerDay = (v==null || isNaN(v)) ? null : v; saveAll(data);
        drawChart();
      });
      row.querySelector('.t-priority').addEventListener('change', e=>{
        const t = data.tasks.find(x=>x.id===id); t.priority = e.target.value; saveAll(data);
        drawChart();
      });
      row.querySelector('.del').addEventListener('click', ()=>{
        data.tasks = data.tasks.filter(x=>x.id!==id);
        for(const d in data.records){ delete data.records[d][id]; }
        saveAll(data); renderTasks(); renderRecordInputs(); drawChart();
      });
    });

    // 重みの編集
    els.weightEditor.innerHTML = Object.entries(data.weights).map(([k,v])=>`
      <label>${k}
        <input data-k="${k}" class="w-edit" type="number" step="0.01" value="${v}">
      </label>`).join('');
    els.weightEditor.querySelectorAll('.w-edit').forEach(inp=>{
      inp.addEventListener('input', e=>{
        const k = e.target.dataset.k;
        const num = Number(e.target.value);
        if (!isNaN(num)) { data.weights[k]=num; saveAll(data); drawChart(); }
      });
    });
  }

  function renderRecordInputs(){
    const day = els.recDate.value;
    const rec = data.records[day] ?? {};
    els.recordInputs.innerHTML = data.tasks.length
      ? data.tasks.map(t => `
          <label>
            ${escapeHtml(t.title)}
            <input data-id="${t.id}" class="rec" type="number" step="0.01" min="0" value="${rec[t.id] ?? ''}" placeholder="実績">
          </label>
        `).join('')
      : `<p class="muted">タスクが未登録です。「日々のタスク定義」から追加してください。</p>`;
    els.recordInputs.querySelectorAll('.rec').forEach(inp=>{
      inp.addEventListener('input', e=>{
        const id = e.target.dataset.id;
        const v = e.target.value === '' ? null : Number(e.target.value);
        data.records[day] = data.records[day] ?? {};
        if (v==null || isNaN(v)) delete data.records[day][id];
        else data.records[day][id]=v;
        saveAll(data);
      });
    });
  }

  // ---- プロフィール保存 ----
  els.saveProfile.addEventListener('click', ()=>{
    Object.assign(data.profile, {
      goalTitle: els.goalTitle.value.trim() || '今年の進捗',
      goalDesc: els.goalDesc.value.trim(),
      goalValue: Number(els.goalValue.value) || 0,
      unit: els.unit.value.trim(),
      startDate: els.startDate.value || todayISO()
    });
    saveAll(data);
    els.profileSaved.textContent = '保存しました';
    setTimeout(()=> els.profileSaved.textContent='', 1200);
  });

  // ---- タスク追加 ----
  els.addTask.addEventListener('click', ()=>{
    data.tasks.push({ id: uid(), title: '新しいタスク', targetPerDay: null, priority: 'B' });
    saveAll(data); renderTasks(); renderRecordInputs();
  });

  // ---- テンプレDL/復元（設定のみ） ----
  els.downloadTemplate.addEventListener('click', ()=>{
    const tpl = { version: data.version, profile: data.profile, tasks: data.tasks, weights: data.weights };
    downloadJSON('template.json', tpl);
  });
  els.uploadTemplate.addEventListener('change', async (e)=>{
    const f = e.target.files?.[0]; if(!f) return;
    try{
      const tpl = await readJSONFile(f);
      if(!tpl.profile || !Array.isArray(tpl.tasks)) throw new Error('テンプレ形式が不正です');
      data.profile = tpl.profile;
      data.tasks = tpl.tasks;
      data.weights = tpl.weights ?? data.weights;
      saveAll(data);
      hydrateProfile(); renderTasks(); renderRecordInputs(); drawChart();
      alert('テンプレートを読み込みました。');
    }catch(err){ alert('読み込みエラー: '+ err.message); }
    e.target.value='';
  });

  // ---- 日付と記録 ----
  els.recDate.value = todayISO();
  els.recDate.addEventListener('change', ()=> renderRecordInputs());
  els.copyPrev.addEventListener('click', ()=>{
    const day = els.recDate.value;
    const prev = addDays(new Date(day), -1);
    const src = data.records[prev] ?? {};
    if(!Object.keys(src).length){ alert('前日の記録がありません'); return; }
    data.records[day] = { ...src };
    saveAll(data); renderRecordInputs();
  });
  els.clearToday.addEventListener('click', ()=>{
    const day = els.recDate.value;
    delete data.records[day];
    saveAll(data); renderRecordInputs();
  });
  els.saveRecord.addEventListener('click', ()=>{
    const day = els.recDate.value;
    const obj = data.records[day] ?? {};
    for(const k of Object.keys(obj)){ if (obj[k]==null || isNaN(obj[k])) delete obj[k]; }
    if (Object.keys(obj).length===0) delete data.records[day]; else data.records[day]=obj;
    saveAll(data);
    els.recordSaved.textContent = '保存しました';
    setTimeout(()=> els.recordSaved.textContent='', 1200);
    drawChart();
  });

  // ---- スコア計算 ----
  function dailyScore(dateISO){
    const rec = data.records[dateISO] ?? {};
    let total = 0, max = 0;
    for(const t of data.tasks){
      const actual = Number(rec[t.id] ?? 0);
      const weight = data.weights[t.priority] ?? 1;
      const target = (t.targetPerDay ?? 0);
      const rate = target > 0 ? Math.min(actual / target, 1) : (actual>0 ? 1 : 0); // 目標なしは「やった/やってない」
      total += rate * weight;
      max   += 1 * weight;
    }
    const norm = max > 0 ? total / max : 0;
    return { score: total, scoreMax: max, rate: norm }; // 0..1
  }

  // ---- グラフ描画（素のCanvas） ----
  let chartDays = 30;
  els.chartRangeBtns.forEach(btn=>{
    btn.addEventListener('click', ()=>{
      els.chartRangeBtns.forEach(b=>b.classList.remove('is-active'));
      btn.classList.add('is-active');
      chartDays = Number(btn.dataset.days);
      drawChart();
    });
  });

  function drawChart(){
    const canvas = els.dailyChart;
    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth || canvas.parentElement.clientWidth || 600;
    const h = canvas.getAttribute('height')|0;
    canvas.width = Math.floor(w * dpr);
    canvas.height = Math.floor(h * dpr);
    ctx.scale(dpr, dpr);

    // 背景
    ctx.clearRect(0,0,w,h);
    ctx.fillStyle = '#fff';
    ctx.fillRect(0,0,w,h);

    // 期間データ
    const end = new Date();
    const dates = [];
    for(let i=chartDays-1;i>=0;i--){
      dates.push( iso(new Date(end.getTime() - i*86400000)) );
    }
    const rates = dates.map(d => dailyScore(d).rate);

    // 軸
    const pad = 28;
    const innerW = w - pad*2;
    const innerH = h - pad*2;
    ctx.strokeStyle = '#ddd';
    ctx.beginPath();
    ctx.moveTo(pad, pad);
    ctx.lineTo(pad, h-pad);
    ctx.lineTo(w-pad, h-pad);
    ctx.stroke();

    // 目盛 0,50,100
    ctx.fillStyle = '#666';
    [0,0.5,1].forEach((p)=>{
      const y = h - pad - innerH * p;
      ctx.fillText(String(p*100), 4, y+3);
      ctx.strokeStyle = '#eee';
      ctx.beginPath();
      ctx.moveTo(pad, y);
      ctx.lineTo(w-pad, y);
      ctx.stroke();
    });

    // 折れ線
    ctx.strokeStyle = '#0078ff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    rates.forEach((r,i)=>{
      const x = pad + innerW * (i/(chartDays-1));
      const y = h - pad - innerH * clamp(r,0,1);
      if(i===0) ctx.moveTo(x,y); else ctx.lineTo(x,y);
    });
    ctx.stroke();

    // 点
    ctx.fillStyle = '#0078ff';
    rates.forEach((r,i)=>{
      const x = pad + innerW * (i/(chartDays-1));
      const y = h - pad - innerH * clamp(r,0,1);
      ctx.beginPath(); ctx.arc(x,y,2.2,0,Math.PI*2); ctx.fill();
    });

    // 期間ラベル
    ctx.fillStyle = '#666';
    ctx.fillText(`${dates[0]} 〜 ${dates[dates.length-1]}`, pad, 16);
  }

  // ---- チャレンジ集計 ----
  function windowStats(fromISO, days){
    let streak=0, best=0, sum=0;
    for(let i=0;i<days;i++){
      const d = addDays(new Date(fromISO), i);
      const r = dailyScore(d).rate;
      sum += r;
      if(r>=0.6){ streak++; if(streak>best) best=streak; } else { streak=0; }
    }
    const avg = days>0 ? sum/days : 0;
    return { avgRate: avg, bestStreak: best };
  }

  function renderChallengeResult(fromISO, days){
    const { avgRate, bestStreak } = windowStats(fromISO, days);
    els.challengeResult.innerHTML = `
      <div class="card">
        <div><strong>期間</strong>：${fromISO} 〜 ${addDays(new Date(fromISO), days-1)}</div>
        <div><strong>平均達成率</strong>：${Math.round(avgRate*100)}%</div>
        <div><strong>ベスト連続達成日数</strong>：${bestStreak} 日</div>
      </div>
    `;
    return { avgRate, bestStreak };
  }

  els.calc30.addEventListener('click', ()=>{
    const s = els.challengeStart.value || data.profile.startDate || todayISO();
    renderChallengeResult(s, 30);
  });
  els.calc100.addEventListener('click', ()=>{
    const s = els.challengeStart.value || data.profile.startDate || todayISO();
    renderChallengeResult(s, 100);
  });

  // ---- 結果カード画像 ----
  els.makeCard.addEventListener('click', ()=>{
    const s = els.challengeStart.value || data.profile.startDate || todayISO();
    const d30 = windowStats(s,30);
    const d100 = windowStats(s,100);
    drawResultCard({
      title: data.profile.goalTitle || '今年の進捗',
      unit: data.profile.unit || '',
      start: s,
      thirty: { avg: Math.round(d30.avgRate*100), best: d30.bestStreak },
      hundred:{ avg: Math.round(d100.avgRate*100), best: d100.bestStreak }
    });
    const url = els.resultCard.toDataURL('image/png');
    els.dlCard.href = url;
  });

  function drawResultCard(info){
    const c = els.resultCard, ctx = c.getContext('2d');
    // 背景
    ctx.fillStyle = '#ffffff'; ctx.fillRect(0,0,c.width,c.height);
    // ヘッダ
    ctx.fillStyle = '#111'; ctx.font = 'bold 64px system-ui, sans-serif';
    ctx.fillText('Progress Report', 60, 120);
    ctx.fillStyle = '#0078ff'; ctx.fillRect(60, 140, 400, 6);

    // タイトル・期間
    ctx.fillStyle = '#111'; ctx.font = 'bold 54px system-ui, sans-serif';
    ctx.fillText(info.title, 60, 230);
    ctx.fillStyle = '#666'; ctx.font = '28px system-ui, sans-serif';
    ctx.fillText(`開始日: ${info.start}`, 60, 280);

    // 30日/100日カード
    function badge(x,y,label,val,best){
      ctx.fillStyle = '#f7f9fc'; ctx.fillRect(x,y,420,320);
      ctx.strokeStyle = '#e5ecf5'; ctx.strokeRect(x,y,420,320);
      ctx.fillStyle = '#111'; ctx.font = 'bold 36px system-ui, sans-serif';
      ctx.fillText(label, x+24, y+60);
      ctx.fillStyle = '#0078ff'; ctx.font = 'bold 96px system-ui, sans-serif';
      ctx.fillText(`${val}%`, x+24, y+160);
      ctx.fillStyle = '#444'; ctx.font = '28px system-ui, sans-serif';
      ctx.fillText(`ベスト連続: ${best} 日`, x+24, y+210);
    }
    badge(60, 340, '30日 平均達成率', info.thirty.avg, info.thirty.best);
    badge(540,340, '100日 平均達成率', info.hundred.avg, info.hundred.best);

    // フッター
    ctx.fillStyle = '#666'; ctx.font = '24px system-ui, sans-serif';
    const now = new Date();
    ctx.fillText(`Generated: ${iso(now)}`, 60, 1210);
    ctx.fillText(`Unit: ${info.unit || '-'}`, 60, 1245);
    ctx.fillStyle = '#0078ff'; ctx.font = '28px system-ui, sans-serif';
    ctx.fillText('Share your progress!', 60, 1290);
  }

  // ---- バックアップ ----
  els.downloadBackup.addEventListener('click', ()=> downloadJSON('progress-backup.json', data));
  els.uploadBackup.addEventListener('change', async (e)=>{
    const f = e.target.files?.[0]; if(!f) return;
    try{
      const b = await readJSONFile(f);
      if(!b.profile || !b.tasks || !b.records) throw new Error('バックアップ形式が不正です');
      data = b; saveAll(data);
      hydrateProfile(); renderTasks(); renderRecordInputs(); drawChart();
      alert('バックアップを復元しました（上書き）。');
    }catch(err){ alert('復元エラー: '+ err.message); }
    e.target.value='';
  });

  // ---- 初期表示 ----
  hydrateProfile();
  renderTasks();
  els.recDate.value = todayISO();
  renderRecordInputs();
  drawChart();
})();
