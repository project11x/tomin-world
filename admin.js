    // Admin Logic
    let adminTapCount = 0;
    let adminTapTimer = null;
    const adminTrigger = document.getElementById('iwe-trigger-admin');
    const adminOverlay = document.getElementById('ios-admin-overlay');
    const passcodeView = document.getElementById('admin-passcode-view');
    const panelView = document.getElementById('admin-panel-view');
    let currentPasscode = "";
    const MASTER_PASSCODE = "7777"; // CHANGE THIS

    if (adminTrigger) {
      adminTrigger.addEventListener('click', () => {
        adminTapCount++;
        clearTimeout(adminTapTimer);
        if (adminTapCount >= 3) {
          adminOpen();
          adminTapCount = 0;
        } else {
          adminTapTimer = setTimeout(() => { adminTapCount = 0; }, 500);
        }
      });
    }

    let loadedStatus = null;
    let selectedDoing = "";
    let selectedVibe = "";

    function adminOpen() {
      adminOverlay.style.display = 'flex';
      setTimeout(() => adminOverlay.classList.add('visible'), 10);
      currentPasscode = "";
      updatePasscodeDots();
      passcodeView.style.display = 'block';
      panelView.style.display = 'none';

      // Load stored values
      document.getElementById('adm-gh-token').value = localStorage.getItem('gh_token') || '';
      document.getElementById('adm-gh-repo').value = localStorage.getItem('gh_repo') || 'project11x/tomin-world';

      // EMERGENCY RENDER: Show chips immediately with defaults so they are never empty
      console.log("Admin: Initializing chips with defaults...");
      const defaultDoing = ["🎬 Pre-Production", "🎥 Shooting", "✂️ Post", "✅ Published"];
      const defaultVibes = ["hyperfocus", "referencing", "stuck", "shipping"];
      renderAdminChips('adm-doing-chips', defaultDoing, "", (val) => { selectedDoing = val; });
      renderAdminChips('adm-vibe-chips', defaultVibes, "", (val) => { selectedVibe = val; });

      // Pre-fill fields from current status
      fetch('status.json').then(r => r.json()).then(d => {
        console.log("Admin: Status data loaded successfully", d);
        loadedStatus = d;
        document.getElementById('adm-rn-note').value = d.rightNow?.note || '';
        document.getElementById('adm-rn-detail').value = d.rightNow?.statusDetail || '';
        document.getElementById('adm-working-on').value = d.workingOn || '';

        selectedDoing = d.rightNow?.title || '';
        selectedVibe = d.vibe?.title || '';

        // Update chips with actual data and active states
        renderAdminChips('adm-doing-chips', d.availableDoing || defaultDoing, selectedDoing, (val) => { selectedDoing = val; });
        renderAdminChips('adm-vibe-chips', d.availableVibes || defaultVibes, selectedVibe, (val) => { selectedVibe = val; });
      }).catch(e => {
        console.error("Admin: Failed to load status.json", e);
      });
    }

    function renderAdminChips(containerId, list, activeVal, onSelect) {
      const container = document.getElementById(containerId);
      if (!container) return;

      const safeList = Array.isArray(list) ? list : [];
      let html = safeList.map(item => `
        <div class="admin-chip ${item === activeVal ? 'active' : ''}" 
             onclick="selectAdminChip(this, '${containerId}', '${item}')">${item}</div>
      `).join('');

      html += `<div class="admin-chip-add" onclick="addAdminChip('${containerId}')">+ New</div>`;
      container.innerHTML = html;
      onSelect(activeVal);
    }

    window.selectAdminChip = function (el, containerId, val) {
      el.parentElement.querySelectorAll('.admin-chip').forEach(c => c.classList.remove('active'));
      el.classList.add('active');
      if (containerId === 'adm-doing-chips') selectedDoing = val;
      else selectedVibe = val;
    };

    window.addAdminChip = function (containerId) {
      const val = prompt("Enter new tag name:");
      if (!val) return;

      if (containerId === 'adm-doing-chips') {
        if (!loadedStatus.availableDoing.includes(val)) loadedStatus.availableDoing.push(val);
        selectedDoing = val;
        renderAdminChips(containerId, loadedStatus.availableDoing, selectedDoing, (v) => { selectedDoing = v; });
      } else {
        if (!loadedStatus.availableVibes.includes(val)) loadedStatus.availableVibes.push(val);
        selectedVibe = val;
        renderAdminChips(containerId, loadedStatus.availableVibes, selectedVibe, (v) => { selectedVibe = v; });
      }
    };

    function adminClose() {
      adminOverlay.classList.remove('visible');
      setTimeout(() => { adminOverlay.style.display = 'none'; }, 400);
    }

    function adminType(num) {
      if (currentPasscode.length < 4) {
        currentPasscode += num;
        updatePasscodeDots();
        if (currentPasscode.length === 4) {
          if (currentPasscode === MASTER_PASSCODE) {
            passcodeView.style.display = 'none';
            panelView.style.display = 'block';
          } else {
            // Shake effect or just reset
            currentPasscode = "";
            setTimeout(updatePasscodeDots, 200);
          }
        }
      }
    }

    function updatePasscodeDots() {
      const dots = document.querySelectorAll('.passcode-dot');
      dots.forEach((dot, i) => {
        if (i < currentPasscode.length) dot.classList.add('filled');
        else dot.classList.remove('filled');
      });
    }

    async function adminSave() {
      const btn = document.getElementById('adm-save-btn');
      const status = document.getElementById('adm-status');
      const token = document.getElementById('adm-gh-token').value;
      const repo = document.getElementById('adm-gh-repo').value;

      if (!token || !repo) {
        status.textContent = "Error: Token and Repo required";
        status.style.color = "#ff453a";
        return;
      }

      localStorage.setItem('gh_token', token);
      localStorage.setItem('gh_repo', repo);

      btn.disabled = true;
      btn.textContent = "Pushing...";
      status.textContent = "Connecting to GitHub...";
      status.style.color = "#fff";

      const newStatus = {
        rightNow: {
          title: selectedDoing,
          note: document.getElementById('adm-rn-note').value,
          statusDetail: document.getElementById('adm-rn-detail').value
        },
        vibe: {
          title: selectedVibe
        },
        workingOn: document.getElementById('adm-working-on').value,
        availableDoing: (loadedStatus && loadedStatus.availableDoing) ? loadedStatus.availableDoing : ["🎬 Pre-Production", "🎥 Shooting", "✂️ Post", "✅ Published"],
        availableVibes: (loadedStatus && loadedStatus.availableVibes) ? loadedStatus.availableVibes : ["hyperfocus", "referencing", "stuck", "shipping"]
      };

      try {
        // 1. Get file SHA
        const fileUrl = `https://api.github.com/repos/${repo}/contents/status.json`;
        const getResp = await fetch(fileUrl, {
          headers: { 'Authorization': `token ${token}` }
        });

        if (!getResp.ok) throw new Error("Could not find status.json on GitHub");
        const fileData = await getResp.json();
        const sha = fileData.sha;

        // 2. Update file
        const updateResp = await fetch(fileUrl, {
          method: 'PUT',
          headers: {
            'Authorization': `token ${token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            message: "Update status.json via mobile admin",
            content: btoa(unescape(encodeURIComponent(JSON.stringify(newStatus, null, 2)))),
            sha: sha
          })
        });

        if (updateResp.ok) {
          status.textContent = "✅ Success! Site will update in a moment.";
          status.style.color = "#30d158";
          
          // Force immediate UI update on the page so user sees it locally
          if (window.populateStatusManually) {
             window.populateStatusManually(newStatus);
          } else {
             // Fallback if global function not exposed yet
             location.reload();
          }
          setTimeout(() => { adminClose(); }, 1500);
        } else {
          const err = await updateResp.json();
          throw new Error(err.message || "Push failed");
        }
      } catch (e) {
        status.textContent = "Error: " + e.message;
        status.style.color = "#ff453a";
      } finally {
        btn.disabled = false;
        btn.textContent = "Push to Cloud";
      }
    }
