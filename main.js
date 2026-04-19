document.addEventListener('DOMContentLoaded', () => {
   // === STATE MANAGEMENT ===
   let apiKey = localStorage.getItem('raasub_apikey') || '';
   let isFirstTime = !localStorage.getItem('raasub_onboarded');
   let videoFile = null;
   let videoDataUrl = null;
   let isAutoScrollEnabled = true; // Defaultnya aktif
   let lastActiveIndex = -1;
   let subtitles = [];
   let pixelsPerSecond = 50;

   // === DEBOUNCE TIMER UNTUK SAVE ===
   let saveTimeout;

   // === DOM ELEMENTS ===
   const els = {
      screens: document.querySelectorAll('.screen'),
      modals: document.querySelectorAll('.modal-overlay'),
      videoInput: document.getElementById('video-input'),
      videoPlayer: document.getElementById('video-player'),
      overlay: document.getElementById('subtitle-overlay'),
      subList: document.getElementById('subtitle-list'),
      subCount: document.getElementById('sub-count'),
      track: document.getElementById('timeline-track'),
      blocks: document.getElementById('timeline-blocks'),
      playhead: document.getElementById('playhead'),
      btnApiKey: document.getElementById('btn-api-key'),
      inputApiKey: document.getElementById('input-api-key'),
      btnExport: document.getElementById('btn-export'),
      chkTranslate: document.getElementById('chk-translate'),
      selLanguage: document.getElementById('sel-language'),
      // Tambahan elemen untuk indikator simpan (opsional, pastikan ada di HTML)
      saveIndicator: document.getElementById('save-indicator')
   };

   // === FUNGSI PENYIMPANAN PROYEK (DENGAN FEEDBACK VISUAL) ===
   function saveProject() {
      const projectData = {
         subtitles: subtitles,
         lastUpdated: new Date().getTime()
      };
      localStorage.setItem('raasub_project_cache', JSON.stringify(projectData));
      console.log('Proyek disimpan otomatis.');

      // Visual feedback: tampilkan "Tersimpan" selama 1 detik
      if (els.saveIndicator) {
         els.saveIndicator.classList.add('show');
         setTimeout(() => {
            els.saveIndicator.classList.remove('show');
         }, 2000);
      }
   }

   // Fungsi debounced save untuk input teks
   function debouncedSave() {
      clearTimeout(saveTimeout);
      saveTimeout = setTimeout(() => {
         saveProject();
      }, 500);
   }

   // === FUNGSI RESET PROYEK ===
   function resetProject() {
      if (confirm("Hapus semua baris subtitle dan mulai dari awal? Tindakan ini tidak bisa dibatalkan.")) {
         subtitles = [];
         localStorage.removeItem('raasub_project_cache');
         if (document.getElementById('screen-workspace').classList.contains('active')) {
            renderWorkspace();
         }
         showScreen('screen-upload');
      }
   }

   // === FUNGSI PEMUAT PROYEK ===
   function loadProjectFromStorage() {
      const saved = localStorage.getItem('raasub_project_cache');
      if (saved) {
         try {
            const parsed = JSON.parse(saved);
            if (parsed.subtitles && Array.isArray(parsed.subtitles)) {
               return parsed.subtitles;
            }
         } catch (e) {
            console.warn('Gagal memuat proyek tersimpan:', e);
         }
      }
      return [];
   }

   // === INISIALISASI ===
   updateApiKeyUI();
   if (isFirstTime) showModal('modal-tutorial');
   
   // Muat subtitle
   subtitles = loadProjectFromStorage();

   // CEK APAKAH ADA DRAF SAAT REFRESH
   if (subtitles.length > 0) {
      // Jika ada data tapi videoFile kosong (habis refresh)
      // Kita beri tahu user untuk upload ulang videonya saja
      const dropZone = document.getElementById('drop-zone');
      if (dropZone) {
         dropZone.innerHTML += `
            <div class="recover-alert" style="margin-top: 20px; padding: 15px; background: rgba(57, 255, 20, 0.1); border: 1px solid #39ff14; border-radius: 8px;">
                <p style="color: #39ff14; font-size: 0.9rem;">✨ Draf subtitle ditemukan! Silakan upload ulang video yang sama untuk melanjutkan editing.</p>
            </div>
         `;
      }
   }

   // === NAVIGATION & MODALS ===
   function showScreen(id) {
      els.screens.forEach(s => s.classList.remove('active'));
      document.getElementById(id).classList.add('active');
   }

   function showModal(id) {
      els.modals.forEach(m => m.classList.add('hidden'));
      document.getElementById(id).classList.remove('hidden');
   }

   function hideModals() {
      els.modals.forEach(m => m.classList.add('hidden'));
   }

   // Modal Events
   document.getElementById('btn-close-tutorial').onclick = () => {
      localStorage.setItem('raasub_onboarded', 'true');
      hideModals();
   };

   els.btnApiKey.onclick = () => {
      els.inputApiKey.value = apiKey;
      showModal('modal-api');
   };

   document.getElementById('btn-save-api').onclick = () => {
      apiKey = els.inputApiKey.value.trim();
      localStorage.setItem('raasub_apikey', apiKey);
      updateApiKeyUI();
      hideModals();
   };

   document.getElementById('btn-close-api').onclick = hideModals;

   function updateApiKeyUI() {
      if (apiKey) {
         els.btnApiKey.className = 'btn-outline status-green';
         els.btnApiKey.innerHTML = '<i class="hgi hgi-stroke hgi-rounded hgi-key-01"></i> <span>API Key Tersimpan</span>';
      } else {
         els.btnApiKey.className = 'btn-outline status-red';
         els.btnApiKey.innerHTML = '<i class="hgi hgi-stroke hgi-rounded hgi-key-01"></i> <span>Set API Key</span>';
      }
   }

   els.chkTranslate.onchange = (e) => {
      if (e.target.checked) els.selLanguage.classList.remove('hidden');
      else els.selLanguage.classList.add('hidden');
   };

   // === STEP 1: UPLOAD VIDEO ===
   function proceedWithVideo(file, isRecovering) {
      videoFile = file;
      els.videoPlayer.src = URL.createObjectURL(file);

      // JALUR RECOVERY: Langsung buka editor, jangan baca Base64 (Hemat Memori & Waktu)
      if (isRecovering) {
         showScreen('screen-workspace');
         els.btnExport.classList.remove('hidden');
         // Pastikan elemen ini ada di HTML, jika tidak ada hapus baris bawah ini
         const btnOpenModal = document.getElementById('btn-open-export-modal');
         if(btnOpenModal) btnOpenModal.classList.remove('hidden');
         
         renderWorkspace();
         return; // SELESAI di sini untuk recovery
      }

      // JALUR BARU: Baru baca Base64 untuk dikirim ke Gemini
      const reader = new FileReader();
      reader.onload = (e) => {
         videoDataUrl = e.target.result.split(',')[1];
         showModal('modal-settings');
      };
      reader.onerror = () => alert("Gagal membaca file video.");
      reader.readAsDataURL(file);
   }

els.videoInput.onchange = (e) => {
   const file = e.target.files[0];
   if (!file) return;

   // 1. Cek Draf (Paling Prioritas)
   if (subtitles && subtitles.length > 0) {
      if (confirm("Draf ditemukan. Lanjutkan editing?")) {
         proceedWithVideo(file, true);
         els.videoInput.value = ""; // Reset input
         return;
      } else {
         subtitles = [];
         localStorage.removeItem('raasub_project_cache');
      }
   }

   // 2. Cek API Key (Hanya untuk proyek baru)
   if (!apiKey) {
      alert("Masukkan Gemini API Key terlebih dahulu!");
      els.videoInput.value = ""; 
      return;
   }

   proceedWithVideo(file, false);
   els.videoInput.value = ""; 
};

   // === STEP 2: GEMINI API CALL ===
   document.getElementById('btn-start-ai').onclick = async () => {
      hideModals();
      showScreen('screen-loading');

      const tone = document.getElementById('sel-tone').value;
      const doTranslate = els.chkTranslate.checked;
      const targetLang = els.selLanguage.value;
      const doSplit = document.getElementById('chk-autosplit').checked;
      const doSound = document.getElementById('chk-soundevent').checked;

      let promptText = `You are a professional Subtitle Editor. Transcribe the audio from the provided video accurately.
        
STRICT RULES:
1. Output MUST be a raw JSON array of objects.
2. Format: [{"start": 0.0, "end": 2.5, "text": "string"}]
3. Precision: Use up to 2 decimal places for numbers.
4. Tone: ${tone}.
`;
      if (doTranslate) promptText += `5. TRANSLATION: Translate the transcript into ${targetLang}.\n`;
      if (doSplit) promptText += `6. AUTO-SPLIT: Limit "text" length to max 42 characters. Split long sentences.\n`;
      if (doSound) promptText += `7. SOUND EVENTS: Include significant non-speech sounds in brackets, e.g., [Laughter], [Music].\n`;

      promptText += "\nIMPORTANT: Return ONLY valid JSON. No markdown backticks, no intro text.";

      try {
         const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`, {
            method: 'POST',
            headers: {
               'Content-Type': 'application/json'
            },
            body: JSON.stringify({
               contents: [{
                  parts: [{
                        text: promptText
                     },
                     {
                        inline_data: {
                           mime_type: videoFile.type,
                           data: videoDataUrl
                        }
                     }
                  ]
               }]
            })
         });

         if (!response.ok) throw new Error("API Error / Quota Limit");

         const data = await response.json();
         let aiText = data.candidates[0].content.parts[0].text;

         aiText = aiText.replace(/```json/g, '').replace(/```/g, '').trim();

         subtitles = JSON.parse(aiText);
         saveProject(); // Simpan langsung tanpa debounce (penting)
         showScreen('screen-success');

      } catch (error) {
         alert("Gagal memproses AI: " + error.message + "\n\nPastikan durasi video tidak terlalu panjang (Base64 limit di browser) dan API Key valid.");
         showScreen('screen-upload');
      }
   };

   // === STEP 3: WORKSPACE & EDITOR ===
   document.getElementById('btn-enter-editor').onclick = () => {
      showScreen('screen-workspace');
      els.btnExport.classList.remove('hidden');
      document.getElementById('btn-open-export-modal').classList.remove('hidden');
      renderWorkspace();
   };

   // ===== FUNGSI-FUNGSI EDITOR =====
   async function translateRow(index) {
      const card = document.getElementById(`card-${index}`);
      const originalText = subtitles[index].text;
      const targetLang = document.getElementById('sel-language').value || "Indonesian";
      const tone = document.getElementById('sel-tone').value || "Casual";

      if (!apiKey) return alert("API Key tidak ditemukan.");

      card.classList.add('row-loading');

      const promptText = `Translate this specific subtitle line to ${targetLang}. 
Tone: ${tone}. 
Original Text: "${originalText}"

IMPORTANT: Return ONLY the translated string. No quotes, no explanations, no JSON.`;

      try {
         const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`, {
            method: 'POST',
            headers: {
               'Content-Type': 'application/json'
            },
            body: JSON.stringify({
               contents: [{
                  parts: [{
                     text: promptText
                  }]
               }]
            })
         });

         const data = await response.json();
         const translatedText = data.candidates[0].content.parts[0].text.trim();

         subtitles[index].text = translatedText;
         card.querySelector('.sub-text').innerText = translatedText;

         saveProject(); // Simpan segera (operasi penting)

      } catch (error) {
         console.error("Gagal menerjemahkan baris:", error);
         alert("Gagal menerjemahkan baris ini.");
      } finally {
         card.classList.remove('row-loading');
      }
   }

   function deleteRow(index) {
      if (confirm("Hapus baris ini?")) {
         subtitles.splice(index, 1);
         saveProject(); // Simpan segera
         renderWorkspace();
      }
   }

   function addSubtitle(index, position = 'after') {
      const currentSub = subtitles[index];
      let newStart, newEnd;

      if (position === 'after') {
         newStart = currentSub.end + 0.1;
         newEnd = newStart + 2.0;
      } else {
         newEnd = Math.max(0.1, currentSub.start - 0.1);
         newStart = Math.max(0, newEnd - 2.0);
      }

      const newSub = {
         start: newStart,
         end: newEnd,
         text: "Ketik subtitle baru di sini..."
      };

      const insertAt = position === 'after' ? index + 1 : index;
      subtitles.splice(insertAt, 0, newSub);

      saveProject(); // Simpan segera
      renderWorkspace();

      setTimeout(() => {
         const newCard = document.getElementById(`card-${insertAt}`);
         if (newCard) {
            newCard.querySelector('.sub-text').focus();
            newCard.scrollIntoView({
               behavior: 'smooth',
               block: 'center'
            });
         }
      }, 100);
   }

   function renderWorkspace() {
      els.subCount.innerText = `${subtitles.length} Baris`;
      els.subList.innerHTML = '';
      els.blocks.innerHTML = '';

      if (els.videoPlayer.duration) {
         els.blocks.style.width = `${els.videoPlayer.duration * pixelsPerSecond}px`;
      } else {
         els.blocks.style.width = '5000px';
      }

      subtitles.forEach((sub, index) => {
         const card = document.createElement('div');
         card.className = 'sub-card';
         card.id = `card-${index}`;
         card.innerHTML = `
                <div class="sub-meta">
                    <span>#${index + 1}</span>
                    <div class="time-inputs">
                        <input type="text" class="time-input start-time" value="${sub.start.toFixed(2)}" data-idx="${index}">
                        <span>-</span>
                        <input type="text" class="time-input end-time" value="${sub.end.toFixed(2)}" data-idx="${index}">
                    </div>
                </div>
                <div class="sub-text" contenteditable="true" data-idx="${index}">${sub.text}</div>
                
                <div class="sub-actions">
                    <button class="btn-icon add-before" title="Tambah Sebelum">
                        <i class="hgi hgi-stroke hgi-rounded hgi-circle-arrow-up-03"></i> + Sblm
                    </button>
                    <button class="btn-icon add-after" title="Tambah Sesudah">
                        <i class="hgi hgi-stroke hgi-rounded hgi-circle-arrow-down-03"></i> + Ssdh
                    </button>
                    <button class="btn-icon translate-row" title="Terjemahkan Baris">
                        <i class="hgi hgi-stroke hgi-rounded hgi-translate"></i> Terjemah
                    </button>
                    <button class="btn-icon delete-row delete" title="Hapus">
                        <i class="hgi hgi-stroke hgi-rounded hgi-delete-02"></i>
                    </button>
                </div>
            `;
         els.subList.appendChild(card);

         card.querySelector('.add-before').onclick = (e) => {
            e.stopPropagation();
            addSubtitle(index, 'before');
         };

         card.querySelector('.add-after').onclick = (e) => {
            e.stopPropagation();
            addSubtitle(index, 'after');
         };

         card.querySelector('.translate-row').onclick = (e) => {
            e.stopPropagation();
            translateRow(index);
         };

         card.querySelector('.delete-row').onclick = (e) => {
            e.stopPropagation();
            deleteRow(index);
         };

         // GUNAKAN DEBOUNCED SAVE UNTUK INPUT TEKS
         card.querySelector('.sub-text').addEventListener('input', (e) => {
            subtitles[index].text = e.target.innerText;
            debouncedSave(); // Debounce 500ms
         });

         const startInput = card.querySelector('.start-time');
         const endInput = card.querySelector('.end-time');

         startInput.addEventListener('change', (e) => {
            const newVal = parseFloat(e.target.value);
            if (!isNaN(newVal)) {
               subtitles[index].start = newVal;
               updateTimelineBlock(index);
               saveProject(); // Perubahan waktu langsung disimpan (tanpa debounce)
            }
         });

         endInput.addEventListener('change', (e) => {
            const newVal = parseFloat(e.target.value);
            if (!isNaN(newVal)) {
               subtitles[index].end = newVal;
               updateTimelineBlock(index);
               saveProject();
            }
         });

         card.addEventListener('click', () => {
            els.videoPlayer.currentTime = sub.start;
         });

         const block = document.createElement('div');
         block.className = 'sub-block';
         block.id = `block-${index}`;
         block.style.left = `${sub.start * pixelsPerSecond}px`;
         block.style.width = `${Math.max(10, (sub.end - sub.start) * pixelsPerSecond)}px`;
         block.addEventListener('click', (e) => {
            e.stopPropagation();
            els.videoPlayer.currentTime = sub.start;
         });
         els.blocks.appendChild(block);
      });

      // PERBAIKAN: Gunakan onloadedmetadata untuk mencegah penumpukan listener
      if (!els.videoPlayer.duration) {
         // Hapus listener lama jika ada (tidak ada cara langsung, tapi kita bisa overwrite dengan .onloadedmetadata)
         els.videoPlayer.onloadedmetadata = () => {
            els.blocks.style.width = `${els.videoPlayer.duration * pixelsPerSecond}px`;
            subtitles.forEach((_, idx) => updateTimelineBlock(idx));
            // Setelah selesai, kita bisa set ke null agar tidak terpanggil lagi jika renderWorkspace dipanggil ulang
            els.videoPlayer.onloadedmetadata = null;
         };
      }
   }

   function updateTimelineBlock(index) {
      const sub = subtitles[index];
      const block = document.getElementById(`block-${index}`);
      if (block) {
         block.style.left = `${sub.start * pixelsPerSecond}px`;
         block.style.width = `${Math.max(10, (sub.end - sub.start) * pixelsPerSecond)}px`;
      }
   }

   // === STEP 4: VIDEO SYNC ===
   els.videoPlayer.addEventListener('timeupdate', () => {
      const time = els.videoPlayer.currentTime;
      els.playhead.style.left = `${time * pixelsPerSecond}px`;

      const activeSubIndex = subtitles.findIndex(s => time >= s.start && time <= s.end);

      // Jika baris aktif berubah (pindah ke sub selanjutnya atau ke area kosong)
      if (activeSubIndex !== lastActiveIndex) {

         // 1. Hapus class active dari elemen yang sebelumnya aktif saja (lebih cepat)
         if (lastActiveIndex !== -1) {
            const lastCard = document.getElementById(`card-${lastActiveIndex}`);
            const lastBlock = document.getElementById(`block-${lastActiveIndex}`);
            if (lastCard) lastCard.classList.remove('active');
            if (lastBlock) lastBlock.classList.remove('active');
         }

         // 2. Update status baru
         if (activeSubIndex !== -1) {
            els.overlay.innerText = subtitles[activeSubIndex].text;

            const activeCard = document.getElementById(`card-${activeSubIndex}`);
            const activeBlock = document.getElementById(`block-${activeSubIndex}`);

            if (activeCard) {
               activeCard.classList.add('active');
               if (isAutoScrollEnabled) {
                  activeCard.scrollIntoView({
                     behavior: 'smooth',
                     block: 'nearest'
                  });
               }
            }
            if (activeBlock) activeBlock.classList.add('active');
         } else {
            els.overlay.innerText = '';
         }

         lastActiveIndex = activeSubIndex;
      }
   });

   // === STEP 5: EXPORT TO SRT ===
   els.btnExport.onclick = () => {
      let srtContent = "";

      const formatSrtTime = (seconds) => {
         const date = new Date(seconds * 1000);
         const hh = String(date.getUTCHours()).padStart(2, '0');
         const mm = String(date.getUTCMinutes()).padStart(2, '0');
         const ss = String(date.getUTCSeconds()).padStart(2, '0');
         const ms = String(date.getUTCMilliseconds()).padStart(3, '0');
         return `${hh}:${mm}:${ss},${ms}`;
      };

      subtitles.forEach((sub, index) => {
         srtContent += `${index + 1}\n`;
         srtContent += `${formatSrtTime(sub.start)} --> ${formatSrtTime(sub.end)}\n`;
         srtContent += `${sub.text}\n\n`;
      });

      const blob = new Blob([srtContent], {
         type: 'text/plain'
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = "RaaSub_Export.srt";
      a.click();
   };

   // === TOMBOL RESET (JIKA ADA) ===
   const btnReset = document.getElementById('btn-reset');
   if (btnReset) {
      btnReset.addEventListener('click', resetProject);
   }

   // === TOMBOL TOGGLE scroll 
   const btnToggleScroll = document.getElementById('btn-toggle-scroll');

   if (btnToggleScroll) {
      btnToggleScroll.onclick = () => {
         isAutoScrollEnabled = !isAutoScrollEnabled;

         // Update UI tombol
         if (isAutoScrollEnabled) {
            btnToggleScroll.classList.add('active');
            btnToggleScroll.title = "Auto-Scroll: Aktif";
         } else {
            btnToggleScroll.classList.remove('active');
            btnToggleScroll.title = "Auto-Scroll: Mati";
         }
      };
   }

   // === TOMBOL KEMBALI KE UPLOAD ===
   const btnBackToUpload = document.getElementById('btn-back-upload');
   if (btnBackToUpload) {
      btnBackToUpload.addEventListener('click', () => {
         saveProject();
         showScreen('screen-upload');
      });
   }

   // === EXPORT VIDEO HARDSUB ===
   function generateSrtString() {
      let srt = "";

      // Helper untuk mengubah detik ke format HH:MM:SS,ms
      const format = (seconds) => {
         const date = new Date(seconds * 1000);
         const hh = String(date.getUTCHours()).padStart(2, '0');
         const mm = String(date.getUTCMinutes()).padStart(2, '0');
         const ss = String(date.getUTCSeconds()).padStart(2, '0');
         const ms = String(date.getUTCMilliseconds()).padStart(3, '0');
         return `${hh}:${mm}:${ss},${ms}`;
      };

      subtitles.forEach((sub, index) => {
         srt += `${index + 1}\n`; // Nomor urut
         srt += `${format(sub.start)} --> ${format(sub.end)}\n`; // Durasi
         srt += `${sub.text}\n\n`; // Teks subtitle
      });

      return srt;
   }

   function loadScript(src) {
      return new Promise((resolve, reject) => {
         if (document.querySelector(`script[src="${src}"]`)) return resolve();
         const s = document.createElement('script');
         s.src = src;
         s.onload = resolve;
         s.onerror = reject;
         document.head.appendChild(s);
      });
   }

   function addExportLog(message, type = 'info') {
      const logEl = document.getElementById('export-log');
      if (!logEl) return;
      const entry = document.createElement('div');
      entry.className = `log-entry ${type}`;
      entry.innerText = `[${new Date().toLocaleTimeString()}] ${message}`;
      logEl.appendChild(entry);
      logEl.scrollTop = logEl.scrollHeight;
   }

   async function startHardsubExport() {
      document.getElementById('export-state-settings').classList.add('hidden');
      document.getElementById('export-state-process').classList.remove('hidden');
      document.getElementById('export-log').innerHTML = '';

      try {
         addExportLog("Memuat Engine FFmpeg.wasm (±25MB)...", "system");
         // Gunakan versi 0.11.x yang lebih stabil untuk Vanilla JS
         await loadScript('https://unpkg.com/@ffmpeg/ffmpeg@0.11.6/dist/ffmpeg.min.js');

         const {
            createFFmpeg,
            fetchFile
         } = FFmpeg;
         const ffmpeg = createFFmpeg({
            log: false, // Set ke false agar log internal FFmpeg tidak mengotori console
            progress: ({
               ratio
            }) => {
               const pct = Math.round(ratio * 100);
               document.getElementById('render-progress').innerText = `${pct}%`;
            }
         });

         addExportLog("Menginisialisasi File System...");
         await ffmpeg.load();

         addExportLog("Membaca video...");
         ffmpeg.FS('writeFile', 'input.mp4', await fetchFile(videoFile));

         addExportLog("Menyiapkan subtitle...");
         ffmpeg.FS('writeFile', 'subs.srt', generateSrtString());

         addExportLog("Proses Rendering dimulai... (Kipas komputer mungkin akan kencang)", "process");
         const preset = document.getElementById('export-preset').value;

         // Versi aman tanpa spesifik font (menghindari error font missing)
         await ffmpeg.run(
            '-i', 'input.mp4',
            '-vf', "subtitles=subs.srt:force_style='Fontsize=16,PrimaryColour=&H00FFFFFF,Outline=1,Shadow=1'",
            '-preset', preset,
            '-c:a', 'copy', // Salin audio asli tanpa re-encode (biar cepat)
            'output.mp4'
         );

         addExportLog("Render Sukses!", "success");
         const data = ffmpeg.FS('readFile', 'output.mp4');
         renderedVideoBlob = new Blob([data.buffer], {
            type: 'video/mp4'
         });

         document.getElementById('export-state-process').classList.add('hidden');
         document.getElementById('export-state-finished').classList.remove('hidden');

      } catch (err) {
         addExportLog("ERROR: " + err.message, "error");
         console.error(err);
      }
   }

   // === BUTTON LAIN ===
   // Hubungkan tombol Buka Modal Export (misal dari Navbar)
   document.getElementById('btn-open-export-modal').onclick = () => {
      showModal('modal-export-video');
      // Reset tampilan modal ke state awal (settings)
      document.getElementById('export-state-settings').classList.remove('hidden');
      document.getElementById('export-state-process').classList.add('hidden');
      document.getElementById('export-state-finished').classList.add('hidden');
   };

   // Hubungkan tombol "Mulai Render" (di dalam modal)
   document.getElementById('btn-start-render').onclick = () => {
      startHardsubExport(); // Memanggil fungsi render FFmpeg
   };

   // Hubungkan tombol "Unduh Video" (setelah render selesai)
   document.getElementById('btn-download-video').onclick = () => {
      if (renderedVideoBlob) {
         const url = URL.createObjectURL(renderedVideoBlob);
         const a = document.createElement('a');
         a.href = url;
         a.download = "RaaSub_Final_Video.mp4";
         a.click();
      }
   };

   // Hubungkan tombol cancel export
   document.getElementById('btn-cancel-export').onclick = hideModals;

   // Hubungkan tombol "Mulai Proyek Baru" (di modal sukses)
   document.getElementById('btn-export-reset').onclick = () => {
      hideModals();
      resetProject(); // Memanggil fungsi reset yang sudah kita buat
   };

});
