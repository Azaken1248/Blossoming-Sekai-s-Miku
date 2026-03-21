document.addEventListener('DOMContentLoaded', () => {
    const API_BASE = 'https://api.sekai.azaken.com/api/v1/analytics';
    const API_USERS_FALLBACK = 'https://api.sekai.azaken.com/api/users';

    let currentAppMode = 'assignments'; 
    let currentChartTab = 'distribution';
    let currentTableData = []; 
    let mikuChartInstance = null;

    const modeBtns = document.querySelectorAll('.mode-btn');
    const filterForm = document.getElementById('filter-form');
    const resetBtn = document.getElementById('btn-reset');
    const superSearchInput = document.getElementById('super-search');
    
    const filtersAssign = document.getElementById('filters-assignments');
    const filtersUsers = document.getElementById('filters-users');
    
    const groupBySelect = document.getElementById('group-by-select');
    const tableBody = document.getElementById('table-body');
    const theadAssign = document.getElementById('thead-assignments');
    const theadUsers = document.getElementById('thead-users');
    const tableTitle = document.getElementById('table-title');

    const tabBtns = document.querySelectorAll('.tab-btn');
    const chartControls = document.getElementById('chart-controls');
    const insightText = document.getElementById('miku-insight-text');
    const predictorStats = document.getElementById('predictor-stats');

    const s1Val = document.getElementById('stat-1-val'), s1Lbl = document.getElementById('stat-1-label'), i1 = document.getElementById('icon-stat-1');
    const s2Val = document.getElementById('stat-2-val'), s2Lbl = document.getElementById('stat-2-label'), i2 = document.getElementById('icon-stat-2');
    const s3Val = document.getElementById('stat-3-val'), s3Lbl = document.getElementById('stat-3-label'), i3 = document.getElementById('icon-stat-3');
    const s4Val = document.getElementById('stat-4-val'), s4Lbl = document.getElementById('stat-4-label'), i4 = document.getElementById('icon-stat-4');

    initMode();

    modeBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            modeBtns.forEach(b => b.classList.remove('active'));
            const targetBtn = e.target.closest('button');
            targetBtn.classList.add('active');
            
            currentAppMode = targetBtn.dataset.mode;
            initMode();
        });
    });

    function initMode() {
        filterForm.reset();
        superSearchInput.value = '';
        currentChartTab = 'distribution';
        tabBtns.forEach(b => b.classList.remove('active'));
        document.getElementById('tab-btn-dist').classList.add('active');

        if (currentAppMode === 'assignments') {
            filtersAssign.classList.remove('hidden');
            filtersUsers.classList.add('hidden');
            theadAssign.classList.remove('hidden');
            theadUsers.classList.add('hidden');
            tableTitle.innerHTML = `<i class="fa-solid fa-database"></i> Assignments Data`;
            
            s1Lbl.textContent = 'Total Tasks'; i1.className = 'fa-solid fa-list-check';
            s2Lbl.textContent = 'Completion Rate'; i2.className = 'fa-solid fa-check-double';
            s3Lbl.textContent = 'Active Members'; i3.className = 'fa-solid fa-users';
            s4Lbl.textContent = 'Total Extensions'; i4.className = 'fa-solid fa-clock-rotate-left';
            
            document.getElementById('tab-btn-trend').textContent = 'Extension Trends';
            document.getElementById('tab-btn-action').textContent = 'Risk Predictor';
            groupBySelect.innerHTML = `
                <option value="status">Group by Status</option>
                <option value="roleName">Group by Role</option>
                <option value="taskType">Group by Task Type</option>
            `;
            
            fetchGlobalStats_Assignments();
            fetchTableData_Assignments('');
        } else {
            filtersAssign.classList.add('hidden');
            filtersUsers.classList.remove('hidden');
            theadAssign.classList.add('hidden');
            theadUsers.classList.remove('hidden');
            tableTitle.innerHTML = `<i class="fa-solid fa-users-viewfinder"></i> User Roster`;
            
            s1Lbl.textContent = 'Total Users'; i1.className = 'fa-solid fa-users';
            s2Lbl.textContent = 'Clean Records'; i2.className = 'fa-solid fa-shield-heart';
            s3Lbl.textContent = 'Users on Hiatus'; i3.className = 'fa-solid fa-bed';
            s4Lbl.textContent = 'Total Strikes Given'; i4.className = 'fa-solid fa-gavel';
            
            document.getElementById('tab-btn-trend').textContent = 'Strike Distribution';
            document.getElementById('tab-btn-action').textContent = 'Ban Risk Radar';
            groupBySelect.innerHTML = `
                <option value="hiatus">Group by Hiatus Status</option>
                <option value="strikes">Group by Strike Count</option>
            `;
            
            fetchTableData_Users('');
        }
    }

    superSearchInput.addEventListener('input', (e) => {
        const searchTerms = e.target.value.toLowerCase().trim().split(/\s+/);
        
        const filteredData = currentTableData.filter(item => {
            let searchableString = '';
            if (currentAppMode === 'assignments') {
                const userName = item.userId && item.userId.username ? item.userId.username : item.discordUserId;
                const dateStr = new Date(item.deadline).toLocaleDateString();
                searchableString = `${item.taskType||''} ${item.roleName||''} ${userName||''} ${item.status||''} ${dateStr} ${item.extensionCount||0}`.toLowerCase();
            } else {
                const joinDate = new Date(item.createdAt || Date.now()).toLocaleDateString();
                const hiatusText = item.isOnHiatus ? 'hiatus sleeping break' : 'active working';
                searchableString = `${item.username||''} ${item.discordId||''} ${item.strikes||0} strikes ${hiatusText} ${joinDate}`.toLowerCase();
            }
            return searchTerms.every(term => searchableString.includes(term));
        });
        
        renderTable(filteredData);
    });

    filterForm.addEventListener('submit', (e) => {
        e.preventDefault();
        
        if (currentAppMode === 'assignments') {
            const formData = new FormData(filterForm);
            const queryParams = new URLSearchParams();
            for (const [key, value] of formData.entries()) {
                if (value && key !== 'isOnHiatus' && key !== 'hasStrikes') queryParams.append(key, value);
            }
            fetchTableData_Assignments(`?${queryParams.toString()}`);
        } else {
            const hiatusFilter = document.getElementById('filter-user-hiatus').value;
            const strikeFilter = document.getElementById('filter-user-strikes').value;
            
            let filtered = [...currentTableData];
            if (hiatusFilter !== '') {
                const isH = hiatusFilter === 'true';
                filtered = filtered.filter(u => !!u.isOnHiatus === isH);
            }
            if (strikeFilter !== '') {
                filtered = filtered.filter(u => strikeFilter === 'yes' ? u.strikes > 0 : !u.strikes || u.strikes === 0);
            }
            renderTable(filtered);
            updateUserChartFromLocalData(filtered);
        }
    });

    resetBtn.addEventListener('click', () => {
        filterForm.reset();
        if(currentAppMode === 'assignments') fetchTableData_Assignments('');
        else renderTable(currentTableData); 
    });
    tabBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            tabBtns.forEach(b => b.classList.remove('active'));
            e.target.classList.add('active');
            currentChartTab = e.target.dataset.tab;
            
            chartControls.style.display = currentChartTab === 'predictor' ? 'none' : 'block';
            
            if (currentAppMode === 'assignments') {
                if (currentChartTab === 'predictor') fetchPredictorData();
                else if (currentChartTab === 'extensions') fetchExtensionData(groupBySelect.value);
                else fetchChartData(groupBySelect.value);
            } else {
                updateUserChartFromLocalData(currentTableData); 
            }
        });
    });

    groupBySelect.addEventListener('change', (e) => {
        if (currentAppMode === 'assignments') {
            if (currentChartTab === 'distribution') fetchChartData(e.target.value);
            if (currentChartTab === 'extensions') fetchExtensionData(e.target.value);
        } else {
            updateUserChartFromLocalData(currentTableData);
        }
    });

    async function fetchGlobalStats_Assignments() {
        try {
            const usersRes = await fetch(`${API_BASE}/users`).catch(() => fetch(API_USERS_FALLBACK));
            const usersData = await usersRes.json();
            if (usersData.success || usersData.length) s3Val.textContent = usersData.count || usersData.length || 0;

            const statsRes = await fetch(`${API_BASE}/stats?groupBy=status`);
            const statsData = await statsRes.json();
            
            if (statsData.success) {
                let tTasks = 0, cTasks = 0;
                statsData.data.forEach(stat => {
                    tTasks += stat.totalTasks;
                    if (stat._id === 'COMPLETED') cTasks += stat.totalTasks;
                });
                s1Val.textContent = tTasks;
                s2Val.textContent = tTasks > 0 ? Math.round((cTasks / tTasks) * 100) + '%' : '0%';
            }
        } catch (e) { console.error(e); }
    }

    async function fetchTableData_Assignments(qs) {
        tableBody.innerHTML = `<tr><td colspan="6" class="text-center"><i class="fa-solid fa-spinner fa-spin"></i> Processing...</td></tr>`;
        try {
            const res = await fetch(`${API_BASE}/assignments${qs}`);
            const result = await res.json();
            if (result.success) {
                currentTableData = result.data;
                renderTable(currentTableData);
                s4Val.textContent = result.data.reduce((acc, curr) => acc + (curr.extensionCount || 0), 0);
                
                fetchChartData('status');
            }
        } catch (e) { tableBody.innerHTML = `<tr><td colspan="6" class="text-center" style="color:var(--ctp-red)">Network Error</td></tr>`; }
    }

    async function fetchChartData(groupByField) {
        const res = await fetch(`${API_BASE}/stats?groupBy=${groupByField}`);
        const result = await res.json();
        if (result.success) {
            renderChart(result.data, 'doughnut', 'totalTasks', 'Total Tasks');
            generateInsight_Assignments(result.data, 'distribution');
        }
    }

    async function fetchExtensionData(groupByField) {
        const res = await fetch(`${API_BASE}/stats?groupBy=${groupByField}`);
        const result = await res.json();
        if (result.success) {
            const valid = result.data.filter(d => d.extendedTasks > 0);
            renderChart(valid, 'bar', 'extendedTasks', 'Extended Tasks');
            generateInsight_Assignments(valid, 'extensions');
        }
    }

    async function fetchPredictorData() {
        const res = await fetch(`${API_BASE}/assignments?status=PENDING`);
        const result = await res.json();
        if (result.success) {
            let risk = { high: 0, med: 0, low: 0 };
            const now = new Date();
            result.data.forEach(task => {
                const hoursLeft = (new Date(task.deadline) - now) / 3600000;
                if (hoursLeft < 24 || (hoursLeft < 48 && task.hasExtended)) risk.high++;
                else if (hoursLeft < 72 || task.hasExtended) risk.med++;
                else risk.low++;
            });
            
            const cData = [
                { _id: 'High Risk', count: risk.high }, { _id: 'Medium Risk', count: risk.med }, { _id: 'Low Risk', count: risk.low }
            ];
            renderChart(cData, 'pie', 'count', 'Risk', ['#f38ba8', '#f9e2af', '#a6e3a1']);
            
            document.getElementById('risk-high').textContent = risk.high;
            document.getElementById('risk-med').textContent = risk.med;
            document.getElementById('risk-low').textContent = risk.low;
            
            document.getElementById('risk-label-high').textContent = "High Risk:";
            document.getElementById('risk-label-med').textContent = "Med Risk:";
            document.getElementById('risk-label-low').textContent = "Low Risk:";
            
            generateInsight_Assignments(null, 'predictor', { total: result.data.length });
        }
    }

    async function fetchTableData_Users() {
        tableBody.innerHTML = `<tr><td colspan="5" class="text-center"><i class="fa-solid fa-spinner fa-spin"></i> Fetching Roster...</td></tr>`;
        try {
            let res = await fetch(`${API_BASE}/users`).catch(() => null);
            if (!res || res.status === 404) res = await fetch(API_USERS_FALLBACK);
            
            let result = await res.json();
            let users = result.data || result; 
            if (!Array.isArray(users)) users = [];

            currentTableData = users;
            renderTable(currentTableData);
            
            s1Val.textContent = users.length;
            s2Val.textContent = users.filter(u => !u.strikes || u.strikes === 0).length;
            s3Val.textContent = users.filter(u => u.isOnHiatus).length;
            s4Val.textContent = users.reduce((acc, curr) => acc + (curr.strikes || 0), 0);
            
            updateUserChartFromLocalData(users);
        } catch (e) { tableBody.innerHTML = `<tr><td colspan="5" class="text-center" style="color:var(--ctp-red)">Network Error</td></tr>`; }
    }

    function updateUserChartFromLocalData(userData) {
        if (currentChartTab === 'predictor') {
            let risk = { safe: 0, warning: 0, danger: 0 };
            userData.forEach(u => {
                if (!u.strikes || u.strikes === 0) risk.safe++;
                else if (u.strikes === 1) risk.warning++;
                else risk.danger++;
            });
            const cData = [
                { _id: 'Danger (2+ Strikes)', count: risk.danger },
                { _id: 'Warning (1 Strike)', count: risk.warning },
                { _id: 'Safe (0 Strikes)', count: risk.safe }
            ];
            renderChart(cData, 'pie', 'count', 'Ban Risk', ['#f38ba8', '#f9e2af', '#a6e3a1']);
            
            document.getElementById('risk-high').textContent = risk.danger;
            document.getElementById('risk-med').textContent = risk.warning;
            document.getElementById('risk-low').textContent = risk.safe;
            
            document.getElementById('risk-label-high').textContent = "Danger (2+):";
            document.getElementById('risk-label-med').textContent = "Warning (1):";
            document.getElementById('risk-label-low').textContent = "Safe (0):";
            
            generateInsight_Users(null, 'predictor', { total: userData.length, danger: risk.danger });
            return;
        }

        const groupSelect = groupBySelect.value;
        let cData = [];

        if (currentChartTab === 'extensions') {
            const strikeMap = {};
            userData.forEach(u => {
                const s = u.strikes || 0;
                strikeMap[s] = (strikeMap[s] || 0) + 1;
            });
            Object.keys(strikeMap).forEach(k => cData.push({ _id: `${k} Strikes`, count: strikeMap[k] }));
            renderChart(cData, 'bar', 'count', 'Users');
            generateInsight_Users(cData, 'extensions');
        } else {
            if (groupSelect === 'hiatus') {
                const hCount = userData.filter(u => u.isOnHiatus).length;
                cData = [ { _id: 'Active', count: userData.length - hCount }, { _id: 'On Hiatus', count: hCount } ];
            } else {
                let s0 = 0, s1 = 0, s2 = 0;
                userData.forEach(u => {
                    if (!u.strikes) s0++; else if (u.strikes === 1) s1++; else s2++;
                });
                cData = [ { _id: '0 Strikes', count: s0 }, { _id: '1 Strike', count: s1 }, { _id: '2+ Strikes', count: s2 } ];
            }
            renderChart(cData, 'doughnut', 'count', 'Users');
            generateInsight_Users(cData, 'distribution', groupSelect);
        }
    }

    function generateInsight_Assignments(data, tabType, meta = null) {
        predictorStats.style.display = 'none';
        if (tabType === 'predictor') {
            predictorStats.style.display = 'flex';
            insightText.innerHTML = `Miku analyzed <b>${meta.total} pending tasks</b>. <br><br>Tasks marked "High Risk" are due within 24 hours. Consider a reminder!`;
            return;
        }
        if (!data || !data.length) return insightText.textContent = "Not enough data.";
        
        const sorted = [...data].sort((a,b) => (b.totalTasks||b.extendedTasks) - (a.totalTasks||a.extendedTasks));
        const top = sorted[0];
        if (tabType === 'distribution') {
            const percent = Math.round(((top.totalTasks) / data.reduce((a,c)=>a+c.totalTasks,0)) * 100);
            insightText.innerHTML = `Miku noticed <b>${top._id}</b> dominates workflow, making up <b>${percent}%</b> of tasks here.`;
        } else {
            insightText.innerHTML = `Watch out! <b>${top._id}</b> requests the most extensions.`;
        }
    }

    function generateInsight_Users(data, tabType, groupSelect = null, meta = null) {
        predictorStats.style.display = 'none';
        if (tabType === 'predictor') {
            predictorStats.style.display = 'flex';
            insightText.innerHTML = meta.danger > 0 ? `<b>Warning!</b> Miku found ${meta.danger} user(s) at immediate risk of demotion/ban due to strikes.` : "Amazing! No users are currently in the danger zone.";
            return;
        }
        if (!data || !data.length) return insightText.textContent = "Not enough data.";
        
        const sorted = [...data].sort((a,b) => b.count - a.count);
        if (tabType === 'distribution') {
            if (groupSelect === 'hiatus') insightText.innerHTML = `Right now, Miku sees <b>${data.find(d=>d._id==='On Hiatus').count}</b> users taking a well-deserved break.`;
            else insightText.innerHTML = `The vast majority of your users have <b>${sorted[0]._id}</b>. Good job maintaining accountability!`;
        } else {
            insightText.innerHTML = `This chart shows exactly how strikes are spread across the server. Aim to keep the numbers on the left side high!`;
        }
    }

    function renderTable(data) {
        tableBody.innerHTML = '';
        if (data.length === 0) return tableBody.innerHTML = `<tr><td colspan="6" class="text-center">No matching records found. Miku is sad.</td></tr>`;

        data.forEach(item => {
            const tr = document.createElement('tr');
            
            if (currentAppMode === 'assignments') {
                const dateStr = new Date(item.deadline).toLocaleDateString();
                const uName = item.userId && item.userId.username ? item.userId.username : item.discordUserId;
                const isHiatus = item.userId && item.userId.isOnHiatus;
                const hBadge = isHiatus ? `<span class="badge badge-hiatus" title="On Hiatus"><i class="fa-solid fa-bed"></i> Zzz</span>` : '';
                tr.innerHTML = `
                    <td>${item.taskType || 'N/A'}</td>
                    <td>${item.roleName || 'N/A'}</td>
                    <td>${uName} ${hBadge}</td>
                    <td><span class="badge badge-${item.status}">${item.status}</span></td>
                    <td>${dateStr}</td>
                    <td>${item.extensionCount || 0}</td>
                `;
            } else {
                const joinDate = new Date(item.createdAt || Date.now()).toLocaleDateString();
                const isHiatus = item.isOnHiatus;
                const sCount = item.strikes || 0;
                
                let strikeStr = '';
                for(let i=0; i<sCount; i++) strikeStr += `<span class="badge-strike"><i class="fa-solid fa-xmark"></i></span>`;
                if(sCount === 0) strikeStr = '<span style="color:var(--ctp-subtext0)">Clean</span>';

                tr.innerHTML = `
                    <td style="font-weight:600; color:var(--ctp-text)">${item.username || 'Unknown'}</td>
                    <td style="font-size: 0.8rem">${item.discordId || 'N/A'}</td>
                    <td>${strikeStr}</td>
                    <td>${isHiatus ? '<span class="badge badge-EXCUSED"><i class="fa-solid fa-bed"></i> Hiatus</span>' : '<span class="badge badge-COMPLETED">Active</span>'}</td>
                    <td>${joinDate}</td>
                `;
            }
            tableBody.appendChild(tr);
        });
    }

    function renderChart(data, chartType, dataKey, labelStr, customColors = null) {
        const ctx = document.getElementById('mikuChart').getContext('2d');
        if (mikuChartInstance) mikuChartInstance.destroy();

        const colors = customColors || ['#94e2d5', '#f5c2e7', '#89b4fa', '#a6e3a1', '#f9e2af', '#f38ba8'];

        mikuChartInstance = new Chart(ctx, {
            type: chartType,
            data: {
                labels: data.map(item => item._id || 'Unknown'),
                datasets: [{
                    label: labelStr,
                    data: data.map(item => item[dataKey]),
                    backgroundColor: colors, borderWidth: 0,
                    borderRadius: chartType === 'bar' ? 6 : 0,
                    hoverOffset: 4
                }]
            },
            options: {
                responsive: true, maintainAspectRatio: false,
                plugins: { legend: { position: chartType === 'bar' ? 'none' : 'right', labels: { color: '#cdd6f4', font: { family: 'Inter' } } } },
                scales: chartType === 'bar' ? {
                    y: { beginAtZero: true, grid: { color: '#313244' }, ticks: { color: '#a6adc8', stepSize: 1 } },
                    x: { grid: { display: false }, ticks: { color: '#a6adc8' } }
                } : {}
            }
        });
    }
});