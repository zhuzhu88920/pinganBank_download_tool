// ==UserScript==
// @name         平安银行回单/月结单/交易明细下载器
// @namespace    http://tampermonkey.net/
// @version      2.1
// @description  平安银行电子回单/月结单/交易明细自动下载工具
// @author       Caesar
// @match        https://e.orangebank.com.cn/*
// @grant        GM_xmlhttpRequest
// @connect      e.orangebank.com.cn
// ==/UserScript==

(function() {
    'use strict';

    const COMPANIES = {
        '': { name: '', accountNo: '', accountName: '', accountBankName: '' },
        '': { name: '', accountNo: '', accountName: '', accountBankName: '' },
        '': { name: '', accountNo: '', accountName: '', accountBankName: '' }
    };

    let currentCompany = 'wj';

    const API = {
        queryBillList: 'https://e.orangebank.com.cn/brcp/stp/cust/ebank/api/app/electronicBill/queryBillList',
        downloadBills: 'https://e.orangebank.com.cn/brcp/stp/cust/ebank/api/app/electronicBill/downloadBills',
        queryMonthly: 'https://e.orangebank.com.cn/brcp/stp/cust/ebank/api/app/elecMonthlyStatement/query',
        downloadMonthly: 'https://e.orangebank.com.cn/brcp/stp/cust/ebank/api/app/elecMonthlyStatement/download',
        queryTrans: 'https://e.orangebank.com.cn/brcp/stp/cust/ebank/api/transfer/transactedDetails/queryTransactedDetails',
        downloadTrans: 'https://e.orangebank.com.cn/brcp/stp/cust/ebank/api/transfer/transactedDetails/downloadFile',
        antiToken: 'https://e.orangebank.com.cn/brcp/stp/cust/ebank/api/login/antiDuplicationServer/antiDuplicationToken'
    };

    const TPL_YEAR_SELECT = (i, defaultYear) => `<select id="yearSelect${i}" style="width:100%;padding:6px;margin-bottom:10px;border:1px solid #ddd;border-radius:4px;box-sizing:border-box;font-size:12px;">${Array.from({length:16},(_,x)=>`<option value="${defaultYear + x}" ${x === 0 ? 'selected' : ''}>${defaultYear + x}</option>`).join('')}</select>`;
    const TPL_MONTH_SELECT = i => `<div id="monthSelect${i}" style="display:grid;grid-template-columns:repeat(4,1fr);gap:4px;margin-bottom:10px;">${Array.from({length:12},(_,x)=>`<label style="display:flex;align-items:center;cursor:pointer;font-size:11px;padding:3px;border:1px solid #ddd;border-radius:3px;"><input type="checkbox" value="${x+1}" style="margin-right:3px;">${x+1}</label>`).join('')}</div>`;

    function getHeaders() {
        const cookies = document.cookie.split('; ').reduce((obj, c) => {
            const [k, v] = c.split('=');
            if (k) obj[k] = v;
            return obj;
        }, {});
        return { 'Accept': 'application/json, text/plain, */*', 'Content-Type': 'application/json', 'Origin': 'https://e.orangebank.com.cn', 'Referer': 'https://e.orangebank.com.cn/brcp/stp/cust/ebank/front/', 'token': cookies['corporbank_new_token'] || cookies['token'] || '' };
    }

    function request(url, data, isBlob = false, customHeaders = {}) {
        return new Promise((resolve, reject) => {
            const headers = { ...getHeaders(), ...customHeaders };
            GM_xmlhttpRequest({ method: 'POST', url, headers, data: JSON.stringify(data), responseType: isBlob ? 'blob' : undefined, onload: x => resolve(isBlob ? x : JSON.parse(x.responseText)), onerror: reject });
        });
    }

    function getCompany() { return COMPANIES[currentCompany] || COMPANIES.wj; }

    async function getAntiToken() { return (await request(API.antiToken + '?' + Date.now(), {}))?.data?.adToken || ''; }

    function downloadBlob(blob, filename) {
        if (blob?.response?.size > 1000) {
            const url = URL.createObjectURL(blob.response);
            const a = document.createElement('a');
            a.href = url;
            a.download = filename;
            a.click();
            URL.revokeObjectURL(url);
            return true;
        }
        return false;
    }

    async function getAllBills(beginDate, endDate) {
        const c = getCompany();
        return (await request(API.queryBillList, { currencyType: 'RMB', accountNo: c.accountNo, minAmt: '', maxAmt: '', beginDate, endDate, loanFlag: '', orderType: '1', oppositeAccountNo: '', printFlag: '', dayFlag: '000', turnPageBeginPos: '1', turnPageShowNum: 500 }))?.data?.billMessageList || [];
    }

    async function downloadAllBills(bills, year, month) {
        const c = getCompany();
        const batchSize = 50;
        for (let i = 0; i < bills.length; i += batchSize) {
            const batch = bills.slice(i, i + batchSize);
            await downloadBlob(await request(API.downloadBills, {
                billNoList: batch.map(b => ({ billType: b.billType || '001', billSeqNo: b.billSeqNo, bookingDate: b.bookingDate })),
                printType: 'N', actionFlag: '2', accountNo: c.accountNo,
                beginDate: `${year}${month}01`, endDate: `${year}${month}` + new Date(year, month, 0).getDate().toString().padStart(2, '0'),
                dayFlag: '000', queryMode: ''
            }, true), `${year}_${month}_dzhd_${currentCompany}_${Math.floor(i / batchSize) + 1}.pdf`);
            if (i + batchSize < bills.length) await new Promise(_ => setTimeout(_, 500));
        }
    }

    async function queryMonthlyStatement(yearMonth) {
        const c = getCompany();
        return (await request(API.queryMonthly, { accountName: c.accountName, accountNo: c.accountNo, startDate: yearMonth, endDate: yearMonth, turnPageBeginPos: 1, turnPageShowNum: 10 }))?.data?.statementList?.[0];
    }

    async function downloadMonthlyStatement(yearMonth) {
        const c = getCompany();
        const stmt = await queryMonthlyStatement(yearMonth);
        if (!stmt?.pdfUdmpDocId) return false;
        return downloadBlob(await request(API.downloadMonthly, { accountName: c.accountName, accountNo: c.accountNo, startDate: yearMonth, endDate: yearMonth, turnPageBeginPos: 1, turnPageShowNum: 10, udmpDocId: stmt.pdfUdmpDocId }, true), `${yearMonth.slice(0,4)}_${yearMonth.slice(4,6)}_yjd_${currentCompany}.pdf`);
    }

    async function queryTransactionDetails(startDate, endDate) {
        const c = getCompany();
        return parseInt((await request(API.queryTrans, { accountNo: c.accountNo, accountName: c.accountName, accountBankName: c.accountBankName || '', ccy: 'RMB', tranType: '', counterAcctNo: '', counterAcctName: '', startDate, endDate, ranking: '0', turnPageBeginPos: 1, turnPageShowNum: 10, queryType: '02', accountType: '0' }))?.data?.turnPageTotalNum || 0);
    }

    async function downloadTransactionDetails(totalNum, startDate, endDate, filename) {
        const adToken = await getAntiToken();
        return downloadBlob(await request(API.downloadTrans, { accountNo: getCompany().accountNo, accountName: getCompany().accountName, accountBankName: getCompany().accountBankName || '', ccy: 'RMB', tranType: '', counterAcctNo: '', counterAcctName: '', startDate, endDate, ranking: '0', turnPageBeginPos: 1, turnPageShowNum: totalNum, queryType: '02', accountType: '0', fileType: '01', turnPageTotalNum: totalNum }, true, { 'adtoken': adToken }), filename);
    }

    function createUI() {
        const currentYear = new Date().getFullYear();
        const div = document.createElement('div');
        div.style.cssText = 'position:fixed;bottom:20px;left:20px;width:280px;background:#fff;border-radius:10px;box-shadow:0 4px 20px rgba(0,0,0,0.2);padding:15px;z-index:99999;font-family:微软雅黑,Arial;font-size:12px;color:#333;';
        div.innerHTML = `
            <div style="margin-bottom:10px;"><label style="display:block;margin-bottom:5px;">公司:</label><select id="companySelect" style="width:100%;padding:6px;border:1px solid #ddd;border-radius:4px;box-sizing:border-box;">${Object.entries(COMPANIES).map(([k,v])=>`<option value="${k}" ${k===currentCompany?'selected':''}>${v.name} (${v.accountNo})</option>`).join('')}</select></div>
            <div style="display:flex;margin-bottom:10px;border-bottom:1px solid #eee;padding-bottom:8px;"><span id="tab1" style="flex:1;text-align:center;padding:5px;cursor:pointer;color:#ff6600;border-bottom:2px solid #ff6600;font-weight:bold;">回单</span><span id="tab2" style="flex:1;text-align:center;padding:5px;cursor:pointer;color:#999;">月结单</span><span id="tab3" style="flex:1;text-align:center;padding:5px;cursor:pointer;color:#999;">明细</span></div>
            <div id="panel1">${TPL_YEAR_SELECT(1, currentYear).replace('margin-bottom:10px;','margin-bottom:5px;')}<label style="display:block;margin-bottom:5px;">月份:</label>${TPL_MONTH_SELECT(1).replace('margin-bottom:10px;','margin-bottom:10px;')}</div>
            <div id="panel2" style="display:none;">${TPL_YEAR_SELECT(2, currentYear).replace('margin-bottom:10px;','margin-bottom:5px;')}<label style="display:block;margin-bottom:5px;">月份:</label>${TPL_MONTH_SELECT(2).replace('margin-bottom:10px;','margin-bottom:10px;')}</div>
            <div id="panel3" style="display:none;">${TPL_YEAR_SELECT(3, currentYear).replace('margin-bottom:10px;','margin-bottom:5px;')}<label style="display:block;margin-bottom:5px;">月份:</label>${TPL_MONTH_SELECT(3).replace('margin-bottom:10px;','margin-bottom:10px;')}</div>
            <button id="btn" style="width:100%;padding:8px;background:#ff6600;color:#fff;border:none;border-radius:4px;cursor:pointer;font-size:12px;">开始下载</button>
            <div id="msg" style="margin:8px 0;font-size:11px;min-height:20px;word-break:break-all;"></div>
        `;
        document.body.appendChild(div);

        const panels = [1, 2, 3].map(i => ({
            tab: div.querySelector(`#tab${i}`),
            panel: div.querySelector(`#panel${i}`),
            year: div.querySelector(`#yearSelect${i}`),
            months: div.querySelectorAll(`#monthSelect${i} input[type="checkbox"]`)
        }));

        div.querySelector('#companySelect').onchange = function() { currentCompany = this.value; };

        panels.forEach((p, i) => p.tab.onclick = () => {
            panels.forEach((x, j) => {
                x.tab.style.color = j === i ? '#ff6600' : '#999';
                x.tab.style.borderBottomColor = j === i ? '#ff6600' : 'transparent';
                x.panel.style.display = j === i ? 'block' : 'none';
            });
        });

        const btn = div.querySelector('#btn'), msg = div.querySelector('#msg');
        const log = (t, c) => msg.innerHTML = `<span style="color:${c||'#666'}">${t}</span>`;

        btn.onclick = async () => {
            btn.disabled = true;
            btn.textContent = '处理中...';
            const tabIdx = panels.findIndex(p => p.panel.style.display !== 'none');
            const panel = panels[tabIdx];
            const year = panel.year.value;
            const months = Array.from(panel.months).filter(cb => cb.checked).map(cb => cb.value);

            if (months.length === 0) { log('请选月份', 'red'); btn.disabled = false; btn.textContent = '开始下载'; return; }

            if (tabIdx === 0) {
                log(`${year}年 ${months.length}个月...`, 'blue');
                let count = 0;
                for (let i = 0; i < months.length; i++) {
                    const m = months[i].padStart(2, '0');
                    const begin = `${year}${m}01`, end = `${year}${m}` + new Date(year, m, 0).getDate().toString().padStart(2, '0');
                    log(`${year}-${m}查询回单...`, 'blue');
                    const bills = await getAllBills(begin, end);
                    if (bills.length > 0) { await downloadAllBills(bills, year, m); count += bills.length; log(`${year}-${m}: ${bills.length}张`, 'green'); }
                    else log(`${year}-${m}: 0张`, '#999');
                    if (i < months.length - 1) await new Promise(_ => setTimeout(_, 500));
                }
                log(`完成 ${count}张`, 'green');
            } else if (tabIdx === 1) {
                log(`${year}年 ${months.length}个月...`, 'blue');
                let count = 0;
                for (let i = 0; i < months.length; i++) {
                    const ym = `${year}${months[i].padStart(2, '0')}`;
                    log(`${year}-${months[i]}查询月结单...`, 'blue');
                    if (await downloadMonthlyStatement(ym)) { count++; log(`${year}-${months[i]}: 成功`, 'green'); }
                    else log(`${year}-${months[i]}: 失败`, 'red');
                    if (i < months.length - 1) await new Promise(_ => setTimeout(_, 500));
                }
                log(`完成 ${count}个`, 'green');
            } else {
                const ms = months.map(Number).sort((a, b) => a - b);
                const first = ms[0], last = ms[ms.length - 1];
                const start = `${year}${first.toString().padStart(2, '0')}01`;
                const end = `${year}${last.toString().padStart(2, '0')}${new Date(year, last, 0).getDate()}`;
                const filename = ms.length === 1 ? `${year}_${first.toString().padStart(2, '0')}_jymx_${currentCompany}.xlsx` : `${year}_Q${Math.ceil(first / 3)}_jymx_${currentCompany}.xlsx`;
                log(`${filename}查询中...`, 'blue');
                const total = await queryTransactionDetails(start, end);
                if (total > 0) { const ok = await downloadTransactionDetails(total, start, end, filename); log(ok ? `下载成功 (${total}条)` : '下载失败', ok ? 'green' : 'red'); }
                else log('没有数据', '#999');
            }

            btn.disabled = false;
            btn.textContent = '开始下载';
        };
    }

    setTimeout(createUI, 2000);
})();
