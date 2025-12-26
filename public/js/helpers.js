// Provide safe no-op implementations so frontend code that calls these functions won't crash.
// If frontend wishes to use real behavior, replace these with actual implementations.

(function (global) {
	// safe bind: attach handler to window resize and return handler for unbinding
	function bindSidebarResize(handler) {
		if (typeof handler === 'function') {
			window.addEventListener('resize', handler);
			return handler;
		}
		return null;
	}

	// safe unbind: remove previously bound handler
	function unbindSidebarResize(handler) {
		if (typeof handler === 'function') {
			window.removeEventListener('resize', handler);
		}
	}

	// Only set globals if not already provided by frontend code
	global.bindSidebarResize = global.bindSidebarResize || bindSidebarResize;
	global.unbindSidebarResize = global.unbindSidebarResize || unbindSidebarResize;

	// 🆕 Render a list of alternatives with show/hide behavior using counts from backend
	function renderAlternatives(container, response, initialLimit = 5) {
		if (!container) return;
		const items = Array.isArray(response?.alternatives) ? response.alternatives : [];
		const total = Number(response?.totalResults || items.length);
		const limit = Math.max(0, Number(initialLimit || 5));
		container.innerHTML = '';
		const list = document.createElement('div');
		list.className = 'alt-list';
		items.slice(0, limit).forEach((it, idx) => {
			const el = document.createElement('div');
			el.className = 'alt-item';
			el.innerHTML = `<div class="alt-title">${(it.title||'').replace(/</g,'&lt;')}</div>`;
			list.appendChild(el);
		});
		container.appendChild(list);
		const hiddenCount = Math.max(0, total - limit);
		if (hiddenCount > 0) {
			const info = document.createElement('div');
			info.className = 'alt-hidden-info';
			info.textContent = `ซ่อนไปทั้งหมด ${hiddenCount} รายการ`;
			container.appendChild(info);
			const btn = document.createElement('button');
			btn.className = 'alt-show-more';
			btn.textContent = 'แสดงทั้งหมด';
			btn.onclick = () => {
				items.slice(limit).forEach((it, idx) => {
					const el = document.createElement('div');
					el.className = 'alt-item';
					el.innerHTML = `<div class="alt-title">${(it.title||'').replace(/</g,'&lt;')}</div>`;
					list.appendChild(el);
				});
				btn.remove();
				info.remove();
			};
			container.appendChild(btn);
		}
	}

	global.renderAlternatives = global.renderAlternatives || renderAlternatives;

	// Show a large modal with upload conflicts (detailed, localized)
	function showUploadConflictsModal(payload) {
		if (!payload || !payload.conflicts) return;
		// Create overlay
		const overlay = document.createElement('div');
		overlay.className = 'upload-conflicts-overlay';
		overlay.style.position = 'fixed';
		overlay.style.left = 0;
		overlay.style.top = 0;
		overlay.style.right = 0;
		overlay.style.bottom = 0;
		overlay.style.background = 'rgba(0,0,0,0.6)';
		overlay.style.zIndex = 9999;
		// Modal
		const modal = document.createElement('div');
		modal.className = 'upload-conflicts-modal';
		modal.style.position = 'fixed';
		modal.style.left = '50%';
		modal.style.top = '50%';
		modal.style.transform = 'translate(-50%, -50%)';
		modal.style.width = '80%';
		modal.style.maxHeight = '80%';
		modal.style.overflow = 'auto';
		modal.style.background = '#fff';
		modal.style.borderRadius = '8px';
		modal.style.padding = '20px';
		modal.style.boxShadow = '0 8px 24px rgba(0,0,0,0.3)';
		modal.style.zIndex = 10000;
		// Title
		const title = document.createElement('h2');
		title.textContent = payload?.ui?.title || payload?.message_th || 'Upload Failed';
		modal.appendChild(title);
		// Description
		const desc = document.createElement('p');
		desc.textContent = payload?.ui?.description || payload?.message_th || '';
		modal.appendChild(desc);
		// Conflict list
		const list = document.createElement('div');
		list.className = 'upload-conflict-list';
		payload.conflicts.forEach(conf => {
			const item = document.createElement('div');
			item.className = 'upload-conflict-item';
			item.style.borderTop = '1px solid #eee';
			item.style.padding = '8px 0';
			const hdr = document.createElement('div');
			hdr.style.fontWeight = '700';
			hdr.textContent = conf.description || `${conf.type} - rows: ${conf.rows?.join(', ')}`;
			item.appendChild(hdr);
			// show rows detail if available
			if (Array.isArray(conf.rowsDetail)) {
				conf.rowsDetail.forEach(rd => {
					const rowEl = document.createElement('div');
					rowEl.style.fontSize = '13px';
					rowEl.style.marginTop = '4px';
					rowEl.textContent = `แถว ${rd.rowNum}: ID=${rd.CategoriesID || ''} | ชื่อ=${rd.CategoriesName || ''} | Parent=${rd.ParentCategoriesID || ''}`;
					item.appendChild(rowEl);
				});
			}
			list.appendChild(item);
		});
		modal.appendChild(list);
		// Close button
		const btn = document.createElement('button');
		btn.textContent = 'ปิด';
		btn.style.marginTop = '12px';
		btn.onclick = () => { overlay.remove(); };
		modal.appendChild(btn);
		overlay.appendChild(modal);
		document.body.appendChild(overlay);
	}

	global.showUploadConflictsModal = global.showUploadConflictsModal || showUploadConflictsModal;
})(window);
