// Progress Tracker v2.4 — fixed chart scaling, new report layout (top badges / middle diff / bottom chart)
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

    // ★縦に伸びる不具合対策：毎回サイズと変換を完全リセット
    const dpr = window.devicePixelRatio || 1;
    const wCSS = Math.max(320, Math.floor(canvas.clientWidth || canvas.parentElement.clientWidth || 600));
    const hCSS = Math.max(120, Math.floor(canvas.getBoundingClientRect().height || 180)); // CSS高さ（固定）

    // 物理解像度を再設定
    canvas.width  = Math.floor(wCSS * dpr);
    canvas.height = Math.floor(hCSS * dpr);

    // 変換をリセットしてから dpr を適用（累積拡大を防止）
    ctx.setTransform(1,0,0,1,0,0);
    ctx.scale(dpr, dpr);

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
    ctx.strokeStyle = '#263248';
    ctx.beginPath();
    ctx.moveTo(padL, padT);
    ctx.lineTo(padL, h-padB);
    ctx.lineTo(w-padR, h-padB);
    ctx.stroke();

    // 補助線・ラベル
    ctx.strokeStyle = 'rgba(128,160,200,.16)';
    ctx.fillStyle = '#9aa6bf';
    ctx.font = '11px system-ui, sans-serif';
    [0,0.25,0.5,0.75,1].forEach(p=>{
      const y = h - padB - innerH*p;
      ctx.beginPath();
      ctx.moveTo(padL, y);
      ctx.lineTo(w-padR, y);
      ctx.stroke();
      ctx.fillText(String(Math.round(p*100)), 8, y+3);
    });

    // 折れ線
    ctx.strokeStyle = '#6ba8ff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    const denom = Math.max(1, chartDays-1);
    rates.forEach((r,i)=>{
      const x = padL + innerW*(i/denom);
      const y = h - padB - innerH*clamp(r,0,1);
      if(i===0) ctx.moveTo(x,y); else ctx.lineTo(x,y);
    });
    ctx.stroke();

    // ドット
    ctx.fillStyle = '#80ffd4';
    rates.forEach((r,i)=>{
      const x = padL + innerW*(i/denom);
      const y = h - padB - innerH*clamp(r,0,1);
      ctx.beginPath(); ctx.arc(x,y,2.2,0,Math.PI*2); ctx.fill();
    });

    // 期間ラベル
    ctx.fillStyle = '#9aa6bf';
    ctx.font = '12px system-ui, sans-serif';
    ctx.fillText(`${dates[0]} 〜 ${dates[dates.length-1]}`, padL, 12);
  }

  // ---------- challenge ----------
  function windowStats(fromISO, days){
    let streak=0, best=0, sum=0;
    for(let i=0;i<days;i++){
      const d=addDays(new Date(fromISO), i);
      const r=dailyScore(d).rate;
      sum+=r;
      if(r>=0.6){streak++; best=Math.max(best,streak);} else streak=0;
    }
    return { avgRate: days? sum/days:0, bestStreak: best };
  }
  function renderChallengeResult(fromISO, days){
    if(!els.challengeResult) return {avgRate:0,bestStreak:0};
    const { avgRate, bestStreak } = windowStats(fromISO, days);
    els.challengeResult.innerHTML = `
      <div class="card">
        <div><strong>期間</strong>：${fromISO} 〜 ${addDays(new Date(fromISO), days-1)}</div>
        <div><strong>平均達成率</strong>：${Math.round(avgRate*100)}%</div>
        <div><strong>ベスト連続達成日数</strong>：${bestStreak} 日</div>
      </div>`;
    return { avgRate, bestStreak };
  }
  safeOn(els.calc30,'click',()=>{ const s = els.challengeStart?.value || data.profile.startDate || todayISO(); els.calc100?.classList.remove('last-clicked'); renderChallengeResult(s,30); });
  safeOn(els.calc100,'click',()=>{ const s = els.challengeStart?.value || data.profile.startDate || todayISO(); els.calc100?.classList.add('last-clicked'); renderChallengeResult(s,100); });

  // ---------- result card (Top badges / Middle diff / Bottom chart) ----------
  function drawResultCard(info, chartImage){
    if(!els.resultCard) return;
    const c = els.resultCard, ctx = c.getContext('2d');

    // 背景
    ctx.setTransform(1,0,0,1,0,0);
    ctx.clearRect(0,0,c.width,c.height);
    ctx.fillStyle = '#0b0d12'; ctx.fillRect(0,0,c.width,c.height);

    // ヘッダー
    ctx.fillStyle = '#e7ebf3'; ctx.font = 'bold 66px system-ui, sans-serif'; ctx.fillText('Progress Report', 60, 110);
    const grad = ctx.createLinearGradient(60,126,520,132); grad.addColorStop(0,'#6ba8ff'); grad.addColorStop(1,'#80ffd4');
    ctx.fillStyle = grad; ctx.fillRect(60, 126, 520, 6);

    // 上段：30日/100日バッジ（2ブロック）
    function badge(x,y,w,h,label,val,best){
      ctx.fillStyle = '#131720'; ctx.fillRect(x,y,w,h);
      ctx.strokeStyle = '#263248'; ctx.strokeRect(x,y,w,h);
      ctx.fillStyle = '#e7ebf3'; ctx.font = 'bold 34px system-ui, sans-serif'; ctx.fillText(label, x+24, y+54);
      ctx.fillStyle = '#6ba8ff'; ctx.font = 'bold 96px system-ui, sans-serif'; ctx.fillText(`${val}%`, x+24, y+148);
      ctx.fillStyle = '#9aa6bf'; ctx.font = '28px system-ui, sans-serif'; ctx.fillText(`ベスト連続: ${best} 日`, x+24, y+h-24);
    }
    const badgeW = 450, badgeH = 220, pad = 40;
    badge(60, 170, badgeW, badgeH, '30日 平均達成率', info.thirty.avg, info.thirty.best);
    badge(60+badgeW+pad, 170, badgeW, badgeH, '100日 平均達成率', info.hundred.avg, info.hundred.best);

    // 中段：数値比較（横一列に強調）
    const midX = 60, midY = 420, midW = 940, midH = 240;
    ctx.fillStyle = '#131720'; ctx.fillRect(midX,midY,midW,midH);
    ctx.strokeStyle = '#263248'; ctx.strokeRect(midX,midY,midW,midH);

    const latestVal = info.latest;
    const unit = info.unit || '';
    const cur = info.currentValue;
    const goal = info.goalValue;

    const fmt = (v)=> (v==null? '—' : `${v}${unit}`);
    const diff = (a,b)=> (a==null||b==null)? null : (a - b);
    const sign = (n)=> (n>0? '+' : n<0? '−' : '±');

    const d1 = diff(latestVal, cur);
    const d2 = diff(latestVal, goal);

    ctx.fillStyle = '#e7ebf3'; ctx.font = 'bold 34px system-ui, sans-serif';
    ctx.fillText('数値比較', midX+18, midY+46);

    ctx.fillStyle = '#9aa6bf'; ctx.font = '26px system-ui, sans-serif';
    ctx.fillText(`直近値：${fmt(latestVal)} / 基準：${fmt(cur)} / 目標：${fmt(goal)}`, midX+18, midY+86);

    function emphasisRow(y, label, value){
      ctx.fillStyle = '#1a2333'; ctx.fillRect(midX+12, y-30, midW-24, 44);
      ctx.fillStyle = '#e7ebf3'; ctx.font = 'bold 28px system-ui, sans-serif';
      ctx.fillText(label, midX+24, y);
      ctx.fillStyle = '#80ffd4'; ctx.font = 'bold 40px system-ui, sans-serif';
      ctx.fillText(value, midX+300, y+2);
    }
    emphasisRow(midY+136, '直近 − 現在：', d1==null?'—': `${sign(d1).replace('−','-')}${Math.abs(d1).toFixed(2)}${unit}`);
    emphasisRow(midY+190, '直近 − 目標：', d2==null?'—': `${sign(d2).replace('−','-')}${Math.abs(d2).toFixed(2)}${unit}`);

    // 下段：横長グラフ（全幅）
    const gx = 60, gy = 690, gw = 940, gh = 420;
    ctx.fillStyle = '#131720'; ctx.fillRect(gx-10,gy-10,gw+20,gh+20);
    if(chartImage){
      ctx.drawImage(chartImage, gx, gy, gw, gh);
    }else{
      ctx.fillStyle = '#9aa6bf'; ctx.font = '24px system-ui, sans-serif';
      ctx.fillText('グラフを描画できませんでした', gx+20, gy+40);
    }

    // フッター
    ctx.fillStyle = '#9aa6bf'; ctx.font = '24px system-ui, sans-serif';
    ctx.fillText(`Title: ${info.title} ／ Start: ${info.start} ／ Unit: ${info.unit || '-'}`, 60, 1140);
    ctx.fillText(`Generated: ${iso(new Date())}`, 60, 1174);
  }

  // 画像作成
  safeOn(els.makeCard,'click', async ()=>{
    drawChart(); // 直前状態でレンダリング
    let img = null;
    try{
      const url = els.dailyChart.toDataURL('image/png');
      img = await new Promise((res,rej)=>{ const im = new Image(); im.onload=()=>res(im); im.onerror=rej; im.src=url; });
    }catch{}

    const s = els.challengeStart?.value || data.profile.startDate || todayISO();
    const d30 = windowStats(s,30), d100 = windowStats(s,100);
    const latestVal = latestProgressValue();

    drawResultCard({
      title: data.profile.goalTitle || '今年の進捗',
      unit: data.profile.unit || '', start: s,
      thirty:{avg:Math.round(d30.avgRate*100), best:d30.bestStreak},
      hundred:{avg:Math.round(d100.avgRate*100), best:d100.bestStreak},
      currentValue: data.profile.currentValue,
      goalValue: data.profile.goalValue,
      latest: latestVal
    }, img);

    if(els.dlCard && els.resultCard) els.dlCard.href = els.resultCard.toDataURL('image/png');
  });

  // ---------- X(Twitter) ----------
  function openXIntent(text){
    const url = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}`;
    const win = window.open(url, '_blank', 'noopener,noreferrer');
    if(!win){
      navigator.clipboard?.writeText(text);
      alert('投稿テキストをクリップボードにコピーしました。Xに貼り付けて投稿してください。');
    }
  }

  safeOn(els.postDaily,'click', ()=>{
    const site = location.href.split('#')[0];
    const start = data.profile.startDate || todayISO();
    const today = todayISO();
    const days = Math.max(1, Math.floor((new Date(today) - new Date(start))/86400000)+1);
    const use100 = (els.chartRangeBtns||[]).some(b=>b.classList.contains('is-active') && b.dataset.days==='100');
    const todayRate = Math.round(dailyScore(today).rate * 100);

    const text = [
      '今日の進捗メモ✍️',
      `開始から ${days} 日目。${use100?100:30}日連続達成を目指して継続中！`,
      `今日のタスク達成率：${todayRate}%`,
      '#毎日タスク実行チャレンジ',
      site
    ].join('\n');
    openXIntent(text);
  });

  safeOn(els.postChallenge,'click', ()=>{
    const s = els.challengeStart?.value || data.profile.startDate || todayISO();
    const use100 = els.calc100?.classList.contains('last-clicked') || false;
    const days = use100 ? 100 : 30;
    const end = addDays(new Date(s), days-1);
    let resultVal = data.goalProgress[end];
    if(resultVal==null){
      const keys = Object.keys(data.goalProgress).sort();
      for(let i=keys.length-1;i>=0;i--){ if(keys[i] <= end){ resultVal = data.goalProgress[keys[i]]; break; } }
    }
    const unit = data.profile.unit || '';
    const goalV = data.profile.goalValue ?? 0;
    const ok = resultVal==null ? null : (data.profile.goalDir==='gte' ? resultVal >= goalV : resultVal <= goalV);
    const text = [
      `${days}日チャレンジ結果📣`,
      `目標：${data.profile.goalTitle || '目標'}（目標値 ${goalV}${unit}）`,
      `結果：${resultVal!=null?resultVal:'—'}${unit} ／ ${ ok==null ? '—' : ok ? '目標達成🎉' : '未達😭'} `,
      '#毎日タスク実行チャレンジ',
      location.href.split('#')[0]
    ].join('\n');
    openXIntent(text);
  });

  // ---------- backup ----------
  safeOn(els.downloadBackup,'click', ()=> downloadJSON('progress-backup.json', data));
  safeOn(els.uploadBackup,'change', async (e)=>{
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

  // ---------- first render ----------
  hydrateProfile();
  if(els.recDate) els.recDate.value = todayISO();
  renderTasks();
  renderRecordInputs();

  // 初回描画は幅確定後
  const startDraw = () => drawChart();
  if (document.readyState === 'complete') startDraw();
  else window.addEventListener('load', startDraw, { once:true });

  // リサイズ対応
  window.addEventListener('resize', ()=> drawChart());
});
