// === Progress Tracker MVP (no backend) ==========================
(() => {
  const KEY = 'progress-tracker-v2';

  // ---- 日付ヘルパ ----
  const todayISO = () => new Date(Date.now() - new Date().getTimezoneOffset()*60000).toISOString().slice(0,10);
  const iso = d => new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,10);
  const addDays = (d,n)=>{ const t=new Date(d); t.setDate(t.getDate()+n); return iso(t); };

  // ---- デフォルト状態 ----
  const defaultData = () => ({
    version: 2,
    profile: {
      goalTitle: '今年の進捗',
      goalDesc: '',
      goalValue: 100,
      unit: 'pt',
      startDate: todayISO(),
      goalDir: 'gte' // gte: 以上で達成, lte: 以下で達成
    },
    tasks: [
      { id: uid(), title: 'サンプル：運動', targetPerDay: 1, priority: 'A' },
      { id: uid(), title: 'サンプル：学習', targetPerDay: 1, priority: 'B' }
    ],
    records: {},       // { 'YYYY-MM-DD': { [taskId]: number } }
    goalProgress: {},  // 目標の現在値（推移） { 'YYYY-MM-DD': number }
    weights: { S: 1.3, A: 1.15, B: 1, C: 0.85, D: 0.7 }
  });

  // ---- ユーティリティ ----
  function uid(){ return Math.random().toString(36).slice(2,10); }
  function saveAll(obj){ localStorage.setItem(KEY, JSON.stringify(obj)); }
  function loadAll(){ try{ const r = localStorage.getItem(KEY); return r? JSON.parse(r): null; }catch{ return null; } }
  function downloadJSON(filename, obj){
    const blob = new Blob([JSON.stringify(obj, null, 2)], {type:'application/json'});
    const url = URL.createObjectURL(blob);
    const a = Object.assign(document.createElement('a'), {href:url, download:filename}); a.click(); URL.revokeObjectURL(url);
  }
  function readJSONFile(file){ return new Promise((res,rej)=>{ const fr=new FileReader(); fr.onload=()=>{ try{res(JSON.parse(fr.result))}catch(e){rej(e)} }; fr.onerror=rej; fr.readAsText(file,'utf-8'); }); }
  function escapeHtml(s){ return s.replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m])); }
  const clamp = (v,min,max)=>Math.max(min,Math.min(max,v));

  // ---- 状態 ----
  let data = loadAll() ?? defaultData();
  saveAll(data); // 初回でも確実に保存

  // ---- DOM ----
  const $ = id => document.getElementById(id);
  const els = {
    goalTitle: $('goalTitle'), goalDesc: $('goalDesc'), goalValue: $('goalValue'),
    unit: $('unit'), startDate: $('startDate'), goalDir: $('goalDir'),
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

  // ---- 初期反映 ----
  function hydrateProfile(){
    const p = data.profile;
    els.goalTitle.value = p.goalTitle ?? '';
    els.goalDesc.value  = p.goalDesc ?? '';
    els.goalValue.value = p.goalValue ?? 0;
    els.unit.value      = p.unit ?? '';
    els.startDate.value = p.startDate ?? todayISO();
    els.goalDir.value   = p.goalDir ?? 'gte';
    $('challengeStart').value = p.startDate ?? todayISO();
  }

  function renderTasks(){
    els.taskList.innerHTML = `
      <div class="task muted">
        <strong>タスク名</strong>
        <span>1日の目標回数（任意）</span>
        <span>重要度</span>
        <span>操作</span>
      </div>
      ${data.tasks.map(t=>`
        <div class="task" data-id="${t.id}">
          <input class="t-title" type="text" value="${escapeHtml(t.title)}" placeholder="例：ランニング">
          <input class="t-target" type="number" step="0.01" min="0" value="${t.targetPerDay ?? ''}">
          <select class="t-priority">
            ${['S','A','B','C','D'].map(k=>`<option ${t.priority===k?'selected':''}>${k}</option>`).join('')}
          </select>
          <button class="del">削除</button>
        </div>`).join('')}
    `;
    // 行イベント
    els.taskList.querySelectorAll('.task').forEach(row=>{
      const id = row.dataset.id; if(!id) return;
      row.querySelector('.t-title').addEventListener('input', e=>{
        data.tasks.find(x=>x.id===id).title = e.target.value; saveAll(data);
        renderRecordInputs(); drawChart();
      });
      row.querySelector('.t-target').addEventListener('input', e=>{
        const v = e.target.value === '' ? null : Number(e.target.value);
        data.tasks.find(x=>x.id===id).targetPerDay = (v==null || isNaN(v)) ? null : v; saveAll(data);
        drawChart();
      });
      row.querySelector('.t-priority').addEventListener('change', e=>{
        data.tasks.find(x=>x.id===id).priority = e.target.value; saveAll(data);
        drawChart();
      });
      row.querySelector('.del').addEventListener('click', ()=>{
        data.tasks = data.tasks.filter(x=>x.id!==id);
        for(const d in data.records){ delete data.records[d][id]; }
        saveAll(data); renderTasks(); renderRecordInputs(); drawChart();
      });
    });

    // 重み編集
    els.weightEditor.innerHTML = Object.entries(data.weights).map(([k,v])=>`
      <label>${k}
        <input data-k="${k}" class="w-edit" type="number" step="0.01" value="${v}">
      </label>`).join('');
    els.weightEditor.querySelectorAll('.w-edit').forEach(inp=>{
      inp.addEventListener('input', e=>{
        const k = e.target.dataset.k; const num = Number(e.target.value);
        if(!isNaN(num)){ data.weights[k]=num; saveAll(data); drawChart(); }
      });
    });
  }

  function renderRecordInputs(){
    const day = els.recDate.value;
    // 目標推移
    const gp = data.goalProgress[day];
    els.goalProgress.value = (gp ?? '') ;

    // タスク入力
    const rec = data.records[day] ?? {};
    els.recordInputs.innerHTML = data.tasks.length
      ? `<h3 class="muted small" style="margin-top:0">タスク実績</h3>` +
        data.tasks.map(t => `
          <label>
            ${escapeHtml(t.title)}
            <input data-id="${t.id}" class="rec" type="number" step="0.01" min="0"
              value="${rec[t.id] ?? ''}" placeholder="実績">
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

  // ---- プロフィール保存（挙動しない問題の対策：確実に要素IDとイベントを紐付け） ----
  els.saveProfile.addEventListener('click', ()=>{
    const p = data.profile;
    p.goalTitle = els.goalTitle.value.trim() || '今年の進捗';
    p.goalDesc  = els.goalDesc.value.trim();
    p.goalValue = Number(els.goalValue.value) || 0;
    p.unit      = els.unit.value.trim();
    p.startDate = els.startDate.value || todayISO();
    p.goalDir   = els.goalDir.value || 'gte';
    saveAll(data);
    els.profileSaved.textContent = '保存しました';
    setTimeout(()=> els.profileSaved.textContent='', 1400);
  });

  // ---- タスク追加（挙動しない問題の対策：click を厳密にバインド） ----
  els.addTask.addEventListener('click', ()=>{
    data.tasks.push({ id: uid(), title: '新しいタスク', targetPerDay: null, priority: 'B' });
    saveAll(data); renderTasks(); renderRecordInputs();
  });

  // ---- テンプレDL／読み込み（設定のみ） ----
  els.downloadTemplate.addEventListener('click', ()=>{
    const tpl = { version: data.version, profile: data.profile, tasks: data.tasks, weights: data.weights };
    downloadJSON('template.json', tpl);
  });
  els.uploadTemplate.addEventListener('change', async (e)=>{
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

  // ---- 記録：日付系 ----
  els.recDate.value = todayISO();
  els.recDate.addEventListener('change', ()=> renderRecordInputs());

  els.copyPrev.addEventListener('click', ()=>{
    const day = els.recDate.value;
    const prev = addDays(new Date(day), -1);
    const src = data.records[prev] ?? {};
    const gp  = data.goalProgress[prev];
    if(!Object.keys(src).length && gp==null){ alert('前日の記録がありません'); return; }
    if(Object.keys(src).length) data.records[day] = { ...src };
    if(gp!=null) data.goalProgress[day] = gp;
    saveAll(data); renderRecordInputs();
  });

  els.clearToday.addEventListener('click', ()=>{
    const day = els.recDate.value;
    delete data.records[day];
    delete data.goalProgress[day];
    saveAll(data); renderRecordInputs();
  });

  // ---- 今日の保存 ----
  els.saveRecord.addEventListener('click', ()=>{
    const day = els.recDate.value;
    // 目標推移
    const gv = els.goalProgress.value;
    if(gv === '' || isNaN(Number(gv))) delete data.goalProgress[day];
    else data.goalProgress[day] = Number(gv);

    // 空キー除去
    const obj = data.records[day] ?? {};
    for(const k of Object.keys(obj)){ if (obj[k]==null || isNaN(obj[k])) delete obj[k]; }
    if (Object.keys(obj).length===0) delete data.records[day]; else data.records[day]=obj;

    saveAll(data);
    els.recordSaved.textContent = '保存しました';
    setTimeout(()=> els.recordSaved.textContent='', 1400);
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
    return { rate: norm }; // 0..1
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
    ctx.setTransform(dpr,0,0,dpr,0,0);
    ctx.clearRect(0,0,w,h);
    ctx.fillStyle = '#0e1420'; ctx.fillRect(0,0,w,h);

    const end = new Date();
    const dates = [];
    for(let i=chartDays-1;i>=0;i--) dates.push( iso(new Date(end.getTime() - i*86400000)) );
    const rates = dates.map(d => dailyScore(d).rate);

    const pad = 36, innerW = w - pad*2, innerH = h - pad*2;
    // 軸
    ctx.strokeStyle = '#263248';
    ctx.beginPath(); ctx.moveTo(pad,pad); ctx.lineTo(pad,h-pad); ctx.lineTo(w-pad,h-pad); ctx.stroke();

    // 補助線
    ctx.strokeStyle = 'rgba(128,160,200,.16)';
    [0,0.25,0.5,0.75,1].forEach(p=>{
      const y = h - pad - innerH * p;
      ctx.beginPath(); ctx.moveTo(pad,y); ctx.lineTo(w-pad,y); ctx.stroke();
      ctx.fillStyle = '#9aa6bf'; ctx.fillText(String(Math.round(p*100)), 8, y+3);
    });

    // 折れ線
    ctx.strokeStyle = '#6ba8ff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    rates.forEach((r,i)=>{
      const x = pad + innerW * (i/(chartDays-1));
      const y = h - pad - innerH * clamp(r,0,1);
      if(i===0) ctx.moveTo(x,y); else ctx.lineTo(x,y);
    });
    ctx.stroke();

    // 点
    ctx.fillStyle = '#80ffd4';
    rates.forEach((r,i)=>{
      const x = pad + innerW * (i/(chartDays-1));
      const y = h - pad - innerH * clamp(r,0,1);
      ctx.beginPath(); ctx.arc(x,y,2.3,0,Math.PI*2); ctx.fill();
    });

    ctx.fillStyle = '#9aa6bf';
    ctx.fillText(`${dates[0]} 〜 ${dates[dates.length-1]}`, pad, 18);
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

  // ---- 結果カード画像（可視化セクションの「画像作成/ダウンロード」） ----
  els.makeCard.addEventListener('click', ()=>{
    const s = els.challengeStart.value || data.profile.startDate || todayISO();
    const d30 = windowStats(s,30), d100 = windowStats(s,100);
    drawResultCard({
      title: data.profile.goalTitle || '今年の進捗',
      unit: data.profile.unit || '',
      start: s,
      thirty: { avg: Math.round(d30.avgRate*100), best: d30.bestStreak },
      hundred:{ avg: Math.round(d100.avgRate*100), best: d100.bestStreak }
    });
    els.dlCard.href = els.resultCard.toDataURL('image/png');
  });

  function drawResultCard(info){
    const c = els.resultCard, ctx = c.getContext('2d');
    // 背景
    ctx.fillStyle = '#0b0d12'; ctx.fillRect(0,0,c.width,c.height);

    // ヘッダ
    ctx.fillStyle = '#e7ebf3'; ctx.font = 'bold 72px system-ui, sans-serif';
    ctx.fillText('Progress Report', 60, 120);
    // 装飾
    const grad = ctx.createLinearGradient(60,140,460,146);
    grad.addColorStop(0,'#6ba8ff'); grad.addColorStop(1,'#80ffd4');
    ctx.fillStyle = grad; ctx.fillRect(60, 140, 460, 8);

    // タイトル・期間
    ctx.fillStyle = '#e7ebf3'; ctx.font = 'bold 58px system-ui, sans-serif';
    ctx.fillText(info.title, 60, 230);
    ctx.fillStyle = '#9aa6bf'; ctx.font = '30px system-ui, sans-serif';
    ctx.fillText(`開始日: ${info.start}`, 60, 280);

    // 30/100
    function badge(x,y,label,val,best){
      ctx.fillStyle = '#131720'; ctx.fillRect(x,y,420,320);
      ctx.strokeStyle = '#263248'; ctx.strokeRect(x,y,420,320);
      ctx.fillStyle = '#e7ebf3'; ctx.font = 'bold 38px system-ui, sans-serif'; ctx.fillText(label, x+24, y+60);
      ctx.fillStyle = '#6ba8ff'; ctx.font = 'bold 106px system-ui, sans-serif'; ctx.fillText(`${val}%`, x+24, y+165);
      ctx.fillStyle = '#9aa6bf'; ctx.font = '30px system-ui, sans-serif'; ctx.fillText(`ベスト連続: ${best} 日`, x+24, y+210);
    }
    badge(60, 340, '30日 平均達成率', info.thirty.avg, info.thirty.best);
    badge(540,340, '100日 平均達成率', info.hundred.avg, info.hundred.best);

    // フッター
    ctx.fillStyle = '#9aa6bf'; ctx.font = '26px system-ui, sans-serif';
    ctx.fillText(`Unit: ${info.unit || '-'}`, 60, 1210);
    ctx.fillText(`Generated: ${iso(new Date())}`, 60, 1246);
    ctx.fillStyle = '#80ffd4'; ctx.font = '30px system-ui, sans-serif';
    ctx.fillText('Share your progress!', 60, 1290);
  }

  // ---- Post（今日の進捗） ----
  els.postDaily.addEventListener('click', ()=>{
    const site = location.href.split('#')[0];
    const start = data.profile.startDate || todayISO();
    const today = todayISO();
    const days = Math.max(1, Math.floor((new Date(today) - new Date(start))/86400000)+1);

    const targetWindow = (chartDays===100?100:30); // 今見てるレンジを採用
    const text = [
      '今日も忘れずにタスク実行したよ！',
      `今日は${days}日目。${targetWindow}日連続達成目指して頑張ろう！！`,
      '#毎日タスク実行チャレンジ',
      site
    ].join('\n');
    shareOrCopy(text);
  });

  // ---- Post（チャレンジ結果） ----
  els.postChallenge.addEventListener('click', ()=>{
    const s = els.challengeStart.value || data.profile.startDate || todayISO();
    const days = els.calc100.classList.contains('last-clicked') ? 100 : 30; // 簡易に直前の集計を推定
    // 期間末日の目標現在値（なければ直近の値）
    const end = addDays(new Date(s), days-1);
    let resultVal = data.goalProgress[end];
    if(resultVal==null){
      // 直近の値を探す
      const keys = Object.keys(data.goalProgress).sort();
      for(let i=keys.length-1;i>=0;i--){ if(keys[i] <= end){ resultVal = data.goalProgress[keys[i]]; break; } }
    }
    const unit = data.profile.unit || '';
    const goalV = data.profile.goalValue || 0;
    const ok = resultVal==null ? null :
      (data.profile.goalDir==='gte' ? resultVal >= goalV : resultVal <= goalV);

    const text = [
      `${days}日チャレンジ終了！`,
      `目標：目標値 ${goalV}${unit}（${data.profile.goalTitle || '目標'}）`,
      `結果：結果値 ${resultVal!=null?resultVal:'—'}${unit}（${ ok==null ? '—' : ok ? '目標達成😊' : '目標達成ならず😢'}）`,
      'ここからも気を抜かずに頑張ろう～✨',
      '#毎日タスク実行チャレンジ',
      location.href.split('#')[0]
    ].join('\n');
    shareOrCopy(text);
  });

  // どちらのボタンを最後に押したかのメモ（postChallenge用）
  els.calc30.addEventListener('click', ()=> els.calc100.classList.remove('last-clicked'));
  els.calc100.addEventListener('click', ()=> els.calc100.classList.add('last-clicked'));

  function shareOrCopy(text){
    if (navigator.share) {
      navigator.share({ text }).catch(()=> copyToClipboard(text));
    } else {
      copyToClipboard(text);
    }
  }
  function copyToClipboard(text){
    navigator.clipboard?.writeText(text);
    alert('投稿文をコピーしました。お好みのSNSで貼り付けてください。');
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

  // ---- 初期描画 ----
  hydrateProfile(); renderTasks();
  els.recDate.value = todayISO(); renderRecordInputs(); drawChart();
})();
