// ==UserScript==
// @name         平安银行回单/月结单/交易明细下载器
// @namespace    http://tampermonkey.net/
// @version      2.3
// @description  平安银行电子回单/月结单/交易明细自动下载工具
// @author       Caesar
// @match        https://e.orangebank.com.cn/*
// @grant        GM_xmlhttpRequest
// @connect      e.orangebank.com.cn
// ==/UserScript==

(function() {
    'use strict';

    // ========== 公司配置 ==========
    // 新增公司：添加一行即可，快捷键自动生成（取首字母，大写）
    const COMPANIES = {
        'jd':  { name: '京东',     accountNo: '888888888888' },
        'tsl':  { name: '特斯拉',     accountNo: '99999999999' },
        'albb': { name: '阿里巴巴',   accountNo: '66666666666' }
    };

    // 自动生成快捷键：取key首字母（大写）
    const COMPANY_SHORTCUTS = Object.keys(COMPANIES).reduce((acc, key) => {
        const letter = key.charAt(0).toUpperCase();
        acc[key] = letter;
        return acc;
    }, {});

    let currentCompany = 'tsl', currentTab = 0, qPressed = false, firstKey = '';
    const selectedMonths = new Set();

    const API = {
        queryBillList: 'https://e.orangebank.com.cn/brcp/stp/cust/ebank/api/app/electronicBill/queryBillList',
        downloadBills: 'https://e.orangebank.com.cn/brcp/stp/cust/ebank/api/app/electronicBill/downloadBills',
        queryMonthly: 'https://e.orangebank.com.cn/brcp/stp/cust/ebank/api/app/elecMonthlyStatement/query',
        downloadMonthly: 'https://e.orangebank.com.cn/brcp/stp/cust/ebank/api/app/elecMonthlyStatement/download',
        queryTrans: 'https://e.orangebank.com.cn/brcp/stp/cust/ebank/api/transfer/transactedDetails/queryTransactedDetails',
        downloadTrans: 'https://e.orangebank.com.cn/brcp/stp/cust/ebank/api/transfer/transactedDetails/downloadFile',
        antiToken: 'https://e.orangebank.com.cn/brcp/stp/cust/ebank/api/login/antiDuplicationServer/antiDuplicationToken'
    };

    function getHeaders() {
        const c = document.cookie.split('; ').reduce((o, x) => { const [k, v] = x.split('='); if (k) o[k] = v; return o; }, {});
        return { 'Accept': 'application/json', 'Content-Type': 'application/json', 'Origin': 'https://e.orangebank.com.cn', 'Referer': 'https://e.orangebank.com.cn/brcp/stp/cust/ebank/front/', 'token': c.corporbank_new_token || c.token || '' };
    }

    function request(url, data, blob = false, headers = {}) {
        return new Promise((resolve, reject) => {
            GM_xmlhttpRequest({ method: 'POST', url, headers: { ...getHeaders(), ...headers }, data: JSON.stringify(data), responseType: blob ? 'blob' : '', onload: x => resolve(blob ? x : JSON.parse(x.responseText)), onerror: reject });
        });
    }

    function getCompany() { return COMPANIES[currentCompany] || COMPANIES.wj; }
    async function getAntiToken() { return (await request(API.antiToken + '?' + Date.now(), {}))?.data?.adToken || ''; }

    function download(blob, name) {
        if (blob?.response?.size > 1000) {
            const a = document.createElement('a');
            a.href = URL.createObjectURL(blob.response);
            a.download = name;
            a.click();
            URL.revokeObjectURL(a.href);
            return true;
        }
        return false;
    }

    async function getAllBills(s, e) {
        const c = getCompany();
        return (await request(API.queryBillList, { currencyType: 'RMB', accountNo: c.accountNo, minAmt: '', maxAmt: '', beginDate: s, endDate: e, loanFlag: '', orderType: '1', oppositeAccountNo: '', printFlag: '', dayFlag: '000', turnPageBeginPos: '1', turnPageShowNum: 500 }))?.data?.billMessageList || [];
    }

    async function downloadAllBills(bills, y, m) {
        const c = getCompany(), batch = 50;
        for (let i = 0; i < bills.length; i += batch) {
            await download(await request(API.downloadBills, {
                billNoList: bills.slice(i, i + batch).map(b => ({ billType: b.billType || '001', billSeqNo: b.billSeqNo, bookingDate: b.bookingDate })),
                printType: 'N', actionFlag: '2', accountNo: c.accountNo, beginDate: `${y}${m}01`, endDate: `${y}${m}` + new Date(y, m, 0).getDate().toString().padStart(2, '0'), dayFlag: '000', queryMode: ''
            }, true), `${y}_${m}_dzhd_${currentCompany}_${Math.floor(i / batch) + 1}.pdf`);
            if (i + batch < bills.length) await new Promise(_ => setTimeout(_, 500));
        }
    }

    async function queryMonthly(ym) {
        const c = getCompany();
        return (await request(API.queryMonthly, { accountNo: c.accountNo, startDate: ym, endDate: ym, turnPageBeginPos: 1, turnPageShowNum: 10 }))?.data?.statementList?.[0];
    }

    async function downloadMonthly(ym) {
        const c = getCompany(), s = await queryMonthly(ym);
        if (!s?.pdfUdmpDocId) return false;
        return download(await request(API.downloadMonthly, { accountNo: c.accountNo, startDate: ym, endDate: ym, turnPageBeginPos: 1, turnPageShowNum: 10, udmpDocId: s.pdfUdmpDocId }, true), `${ym.slice(0,4)}_${ym.slice(4,6)}_yjd_${currentCompany}.pdf`);
    }

    async function queryTrans(s, e) {
        const c = getCompany();
        return parseInt((await request(API.queryTrans, { accountNo: c.accountNo, ccy: 'RMB', tranType: '', counterAcctNo: '', counterAcctName: '', startDate: s, endDate: e, ranking: '0', turnPageBeginPos: 1, turnPageShowNum: 10, queryType: '02', accountType: '0' }))?.data?.turnPageTotalNum || 0);
    }

    async function downloadTrans(n, s, e, name) {
        return download(await request(API.downloadTrans, { accountNo: getCompany().accountNo, ccy: 'RMB', tranType: '', counterAcctNo: '', counterAcctName: '', startDate: s, endDate: e, ranking: '0', turnPageBeginPos: 1, turnPageShowNum: n, queryType: '02', accountType: '0', fileType: '01', turnPageTotalNum: n }, true, { 'adtoken': await getAntiToken() }), name);
    }

    function renderMonthBtns() {
        return Array.from({length: 12}, (_, i) => {
            const m = i + 1, active = selectedMonths.has(m) ? 'background:#ff6600;color:#fff;' : 'background:#fff;color:#333;';
            return `<span data-month="${m}" style="display:inline-flex;align-items:center;justify-content:center;width:28px;height:28px;border:1px solid #ddd;border-radius:4px;cursor:pointer;font-size:12px;margin:2px;${active}">${m}</span>`;
        }).join('');
    }

    function createUI() {
        const y = new Date().getFullYear();
        const div = document.createElement('div');
        div.style.cssText = 'position:fixed;bottom:20px;left:20px;width:320px;background:#fff;border-radius:10px;box-shadow:0 4px 20px rgba(0,0,0,0.2);padding:15px;z-index:99999;font-family:微软雅黑,Arial;font-size:12px;color:#333;';

        const companyOpts = Object.entries(COMPANIES).map(([k,v])=>`<option value="${k}" ${k===currentCompany?'selected':''}>${v.name}</option>`).join('');
        const companyHelp = Object.entries(COMPANIES).map(([k,v])=>`${COMPANY_SHORTCUTS[k]}-${v.name}`).join(' ');

        div.innerHTML = `
            <div style="margin-bottom:10px;"><label style="display:block;margin-bottom:5px;">公司:</label><select id="c" style="width:100%;padding:6px;border:1px solid #ddd;border-radius:4px;">${companyOpts}</select></div>
            <div style="display:flex;margin-bottom:10px;border-bottom:1px solid #eee;padding-bottom:8px;">
                <span id="t1" style="flex:1;text-align:center;padding:5px;cursor:pointer;color:#ff6600;border-bottom:2px solid #ff6600;">回单</span>
                <span id="t2" style="flex:1;text-align:center;padding:5px;cursor:pointer;color:#999;">月结单</span>
                <span id="t3" style="flex:1;text-align:center;padding:5px;cursor:pointer;color:#999;">明细</span>
            </div>
            <div style="margin-bottom:10px;"><label style="display:block;margin-bottom:5px;">年份:</label><select id="y" style="width:100%;padding:6px;border:1px solid #ddd;border-radius:4px;">${Array.from({length:16},(_,i)=>`<option value="${2020+i}" ${2020+i === y ? 'selected' : ''}>${2020+i}</option>`).join('')}</select></div>
            <div id="m" style="margin-bottom:10px;"></div>
            <div style="margin-bottom:10px;font-size:10px;color:#999;">F1-回单 F2-月结单 F3-明细 | 1-9,0-月份 | Q+1~4-季度 | A-全选 C-清空 | ${companyHelp} | Enter</div>
            <button id="b" style="width:100%;padding:8px;background:#ff6600;color:#fff;border:none;border-radius:4px;cursor:pointer;">开始下载</button>
            <div id="msg" style="margin:8px 0;font-size:11px;min-height:20px;"></div>
        `;
        document.body.appendChild(div);

        const tabs = [div.querySelector('#t1'), div.querySelector('#t2'), div.querySelector('#t3')];
        const yearSel = div.querySelector('#y');
        const btn = div.querySelector('#b'), msg = div.querySelector('#msg');

        function updateMonthBtns() {
            div.querySelector('#m').innerHTML = renderMonthBtns();
            div.querySelectorAll('#m span').forEach(s => s.onclick = function() {
                const m = parseInt(this.dataset.month);
                if (currentTab === 2) selectedMonths.clear();
                selectedMonths.has(m) ? selectedMonths.delete(m) : selectedMonths.add(m);
                updateMonthBtns();
            });
        }
        updateMonthBtns();

        div.querySelector('#c').onchange = function() { currentCompany = this.value; };

        tabs.forEach((t, i) => t.onclick = function() {
            currentTab = i;
            selectedMonths.clear();
            tabs.forEach((x, j) => {
                x.style.color = j === i ? '#ff6600' : '#999';
                x.style.borderBottomColor = j === i ? '#ff6600' : 'transparent';
            });
            updateMonthBtns();
        });

        function log(t, c) { msg.innerHTML = `<span style="color:${c||'#666'}">${t}</span>`; }
        function clearAll() { selectedMonths.clear(); updateMonthBtns(); }

        function switchCompany(key) {
            if (COMPANIES[key]) {
                div.querySelector('#c').value = key;
                currentCompany = key;
                log(`切换: ${COMPANIES[key].name}`, '#ff6600');
            }
        }

        document.onkeydown = function(e) {
            const k = e.key.toUpperCase();
            if (k === 'F1') tabs[0].click();
            else if (k === 'F2') tabs[1].click();
            else if (k === 'F3') tabs[2].click();
            else if (k === 'A') { selectedMonths.clear(); for (let i = 1; i <= 12; i++) selectedMonths.add(i); updateMonthBtns(); }
            else if (k === 'C') clearAll();
            else if (k === 'Q') qPressed = true;
            else if (/^[1-9]$/.test(k) && !qPressed) handleMonth(k === '9' ? 9 : parseInt(k));
            else if (k === '0' && !qPressed) handleMonth(10);
            else if (/^[1-4]$/.test(k) && qPressed) {
                const q = parseInt(k), months = [1,4,7,10];
                clearAll();
                for (let i = 0; i < 3; i++) selectedMonths.add(months[q-1] + i);
                updateMonthBtns();
                qPressed = false;
            } else if (k === 'ENTER') btn.click();
            else {
                const match = Object.entries(COMPANY_SHORTCUTS).find(([_, v]) => v === k);
                if (match && COMPANIES[match[0]]) switchCompany(match[0]);
            }
        };

        document.onkeyup = function(e) {
            const k = e.key.toUpperCase();
            if (k === 'Q') qPressed = false;
        };

        function handleMonth(m) {
            if (currentTab === 2) selectedMonths.clear();
            selectedMonths.has(m) ? selectedMonths.delete(m) : selectedMonths.add(m);
            updateMonthBtns();
        }

        btn.onclick = async function() {
            btn.disabled = true;
            btn.textContent = '处理中...';
            const months = Array.from(selectedMonths).sort((a, b) => a - b);
            if (months.length === 0) { log('请选月份', 'red'); btn.disabled = false; btn.textContent = '开始下载'; return; }
            const year = yearSel.value;

            if (currentTab === 0) {
                log(`${year}年 ${months.length}个月...`, 'blue');
                let cnt = 0;
                for (let i = 0; i < months.length; i++) {
                    const m = months[i].toString().padStart(2, '0');
                    const begin = `${year}${m}01`, end = `${year}${m}` + new Date(year, m, 0).getDate().toString().padStart(2, '0');
                    log(`${year}-${m}查询...`, 'blue');
                    const bills = await getAllBills(begin, end);
                    if (bills.length > 0) { await downloadAllBills(bills, year, m); cnt += bills.length; log(`${year}-${m}: ${bills.length}张`, 'green'); }
                    else log(`${year}-${m}: 0张`, '#999');
                    if (i < months.length - 1) await new Promise(_ => setTimeout(_, 500));
                }
                log(`完成 ${cnt}张`, 'green');
            } else if (currentTab === 1) {
                log(`${year}年 ${months.length}个月...`, 'blue');
                let cnt = 0;
                for (let i = 0; i < months.length; i++) {
                    const ym = `${year}${months[i].toString().padStart(2, '0')}`;
                    log(`${year}-${months[i]}查询...`, 'blue');
                    if (await downloadMonthly(ym)) { cnt++; log(`${year}-${months[i]}: 成功`, 'green'); }
                    else log(`${year}-${months[i]}: 失败`, 'red');
                    if (i < months.length - 1) await new Promise(_ => setTimeout(_, 500));
                }
                log(`完成 ${cnt}个`, 'green');
            } else {
                const first = months[0], last = months[months.length - 1];
                const start = `${year}${first.toString().padStart(2, '0')}01`;
                const end = `${year}${last.toString().padStart(2, '0')}${new Date(year, last, 0).getDate()}`;
                const name = months.length === 1 ? `${year}_${first.toString().padStart(2, '0')}_jymx_${currentCompany}.xlsx` : `${year}_Q${Math.ceil(first / 3)}_jymx_${currentCompany}.xlsx`;
                log(`${name}查询...`, 'blue');
                const total = await queryTrans(start, end);
                if (total > 0) { const ok = await downloadTrans(total, start, end, name); log(ok ? `下载成功 (${total}条)` : '下载失败', ok ? 'green' : 'red'); }
                else log('没有数据', '#999');
            }

            clearAll();
            btn.disabled = false;
            btn.textContent = '开始下载';
        };
    }

    setTimeout(createUI, 2000);
})();
