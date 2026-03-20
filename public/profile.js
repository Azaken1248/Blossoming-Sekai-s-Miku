document.addEventListener('DOMContentLoaded', () => {
    const API_BASE = 'https://api.sekai.azaken.com';
    const API_USERS = `${API_BASE}/api/users`;

    const userSelect = document.getElementById('user-select');
    const loadBtn = document.getElementById('load-profile');
    const shareLink = document.getElementById('share-link');
    const copyImageBtn = document.getElementById('copy-image');
    const downloadBtn = document.getElementById('download-image');
    const copyLinkBtn = document.getElementById('copy-link');
    const statusText = document.getElementById('status-text');

    const cardContainerEl = document.getElementById('capture-area');
    const mainCardEl = document.getElementById('main-id-card');
    
    const avatarEl = document.getElementById('profile-avatar');
    const nameEl = document.getElementById('profile-name');
    const idEl = document.getElementById('profile-id');
    const serverRolesEl = document.getElementById('profile-server-roles');
    const workRolesEl = document.getElementById('profile-work-roles');
    const mikuDescriptionEl = document.getElementById('profile-miku-description');
    const hiatusEl = document.getElementById('profile-hiatus');
    const strikesEl = document.getElementById('profile-strikes');
    const completedEl = document.getElementById('profile-completed');
    const joinedEl = document.getElementById('profile-joined');

    let users = [];
    let currentUser = null;
    let shareBase = API_BASE;

    function handleResize() {
        if (window.innerWidth <= 650) {
            mainCardEl.classList.add('compact-mode');
        } else {
            mainCardEl.classList.remove('compact-mode');
        }
    }
    window.addEventListener('resize', handleResize);
    handleResize(); 

    const queryDiscordId = new URLSearchParams(window.location.search).get('discordId');
    init();

    async function init() {
        statusText.textContent = 'Loading users...';
        users = await fetchUsers();

        if (!users.length) {
            userSelect.innerHTML = '<option value="">No users found</option>';
            statusText.textContent = 'Could not load users from API.';
            return;
        }

        userSelect.innerHTML = users
            .map(user => `<option value="${user.discordId}">${user.username || 'Unknown'} (${user.discordId})</option>`)
            .join('');

        if (queryDiscordId && users.some(user => user.discordId === queryDiscordId)) {
            userSelect.value = queryDiscordId;
        }

        loadProfileById(userSelect.value);
        statusText.textContent = '';
    }

    async function fetchUsers() {
        try {
            const res = await fetch(`${API_USERS}?live=true`);
            if (!res.ok) return [];
            const body = await res.json();
            return Array.isArray(body) ? body : body.data || [];
        } catch (error) {
            console.error('Error fetching users:', error);
            return [];
        }
    }

    function getAvatarUrl(discordId, username) {
        const seed = encodeURIComponent(discordId || username || 'miku');
        return `https://api.dicebear.com/9.x/initials/svg?seed=${seed}&backgroundColor=313244&textColor=94e2d5`;
    }

    async function loadProfileById(discordId) {
        const user = users.find(entry => entry.discordId === discordId);
        if (!user) return;

        const summaryUrl = `${API_USERS}/${encodeURIComponent(user.discordId)}/summary`;
        let summary = null;
        try {
            const sumRes = await fetch(summaryUrl);
            if(sumRes.ok) {
                const sumData = await sumRes.json();
                summary = sumData.data;
            }
        } catch(e) {}

        const merged = summary || user;
        currentUser = merged;

        // Avatar
        const avatarUrl = merged.avatarUrl || merged.profileImageUrl;
        avatarEl.crossOrigin = 'anonymous';
        if (avatarUrl) {
            avatarEl.src = avatarUrl;
            avatarEl.onerror = () => avatarEl.src = getAvatarUrl(merged.discordId, merged.username);
        } else {
            avatarEl.src = getAvatarUrl(merged.discordId, merged.username);
        }

        nameEl.textContent = merged.username || 'Unknown User';
        idEl.textContent = `@${merged.discordId}`;

        if (merged.isOnHiatus) {
            hiatusEl.textContent = '💤 On Hiatus';
            hiatusEl.className = 'badge badge-hiatus';
        } else {
            hiatusEl.textContent = '✨ Active';
            hiatusEl.className = 'badge badge-COMPLETED'; 
        }

        if (merged.strikes > 0) {
            strikesEl.textContent = `${merged.strikes} Strikes`;
            strikesEl.className = 'badge badge-LATE'; 
        } else {
            strikesEl.textContent = 'Clean Record';
            strikesEl.className = 'badge badge-EXCUSED'; 
        }

        mikuDescriptionEl.textContent = merged.mikuDescription || `✨ Exploring the Sekai with ${merged.username || 'this member'}!`;

        const roleList = Array.isArray(merged.actualRoles) && merged.actualRoles.length
            ? merged.actualRoles : (Array.isArray(merged.roles) ? merged.roles : []);
        
        serverRolesEl.innerHTML = roleList.length 
            ? roleList.map(r => `<span class="badge badge-EXCUSED">${r}</span>`).join('')
            : `<span class="badge badge-EXCUSED">Member</span>`;

        workRolesEl.innerHTML = Array.isArray(merged.topTaskRoles) && merged.topTaskRoles.length
            ? merged.topTaskRoles.map(r => `<span class="badge">${r}</span>`).join('')
            : `<span class="badge">-</span>`;

        completedEl.textContent = merged.tasksCompleted || 0;
        
        const dateStr = merged.joinedAt ? new Date(merged.joinedAt).toLocaleDateString() : 'Unknown';
        joinedEl.textContent = dateStr;

        const shareUrl = `${shareBase}/api/users/share/${encodeURIComponent(merged.discordId)}`;
        shareLink.href = shareUrl;
    }

    async function getCardBlob() {
        const offScreen = document.createElement('div');
        offScreen.style.position = 'fixed';
        offScreen.style.top = '-9999px';
        offScreen.style.left = '0';
        offScreen.style.width = '600px'; 
        
        const clone = cardContainerEl.cloneNode(true);
        
        const cardInClone = clone.querySelector('.sekai-id-card');
        if (cardInClone) cardInClone.classList.remove('compact-mode');
        
        offScreen.appendChild(clone);
        document.body.appendChild(offScreen);

        const canvas = await html2canvas(clone, {
            backgroundColor: "#1e1e2e", 
            scale: 2,
            useCORS: true,
            logging: false
        });

        // 5. Cleanup
        document.body.removeChild(offScreen);
        return await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
    }

    loadBtn.addEventListener('click', async () => {
        await loadProfileById(userSelect.value);
        statusText.textContent = 'Profile loaded.';
        setTimeout(() => statusText.textContent = '', 2000);
    });

    userSelect.addEventListener('change', async () => {
        await loadProfileById(userSelect.value);
    });

    copyImageBtn.addEventListener('click', async () => {
        if (!currentUser) return;
        statusText.textContent = 'Generating full-sized image...';
        try {
            const blob = await getCardBlob();
            if (navigator.clipboard && window.ClipboardItem) {
                await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
                statusText.textContent = 'Card copied to clipboard!';
            } else {
                statusText.textContent = 'Clipboard not supported by browser.';
            }
        } catch (error) {
            console.error(error);
            statusText.textContent = 'Failed to copy image.';
        }
        setTimeout(() => statusText.textContent = '', 3000);
    });

    downloadBtn.addEventListener('click', async () => {
        if (!currentUser) return;
        statusText.textContent = 'Preparing download...';
        try {
            const blob = await getCardBlob();
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `sekai-card-${currentUser.username}.png`;
            a.click();
            URL.revokeObjectURL(url);
            statusText.textContent = 'Download started!';
        } catch (error) {
            statusText.textContent = 'Failed to download image.';
        }
        setTimeout(() => statusText.textContent = '', 3000);
    });

    copyLinkBtn.addEventListener('click', async () => {
        if (!currentUser) return;
        const url = `${shareBase}/api/users/share/${encodeURIComponent(currentUser.discordId)}`;
        try {
            await navigator.clipboard.writeText(url);
            statusText.textContent = 'Share link copied!';
        } catch (error) {
            statusText.textContent = 'Failed to copy link.';
        }
        setTimeout(() => statusText.textContent = '', 3000);
    });
});