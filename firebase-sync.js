// firebase-sync.js — Firebase Auth, Firestore, leaderboard, duel, cloud sync
// Загружается как ES Module (type="module")

        import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
        import { getAuth, signInAnonymously, onAuthStateChanged, signInWithCustomToken, GoogleAuthProvider, signInWithPopup, signInWithRedirect, getRedirectResult, signInWithCredential } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
        import { initializeFirestore, collection, doc, setDoc, getDoc, getDocs, addDoc, updateDoc, deleteDoc, onSnapshot, query, where, orderBy, limit, runTransaction } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

        let firebaseConfig;
        if (typeof __firebase_config !== 'undefined') {
            firebaseConfig = JSON.parse(__firebase_config);
        } else {
            firebaseConfig = { apiKey: "AIzaSyDdxtpuznCSK5a6CvcJdbt9pzKMXbUVl08", authDomain: "ege-history-bot.firebaseapp.com", projectId: "ege-history-bot", storageBucket: "ege-history-bot.firebasestorage.app", messagingSenderId: "489223236202", appId: "1:489223236202:web:48110779742d40d748f813" };
        }
        
        const appId = typeof __app_id !== 'undefined' ? __app_id : "ege-history-bot";
        
        const app = initializeApp(firebaseConfig); 
        const auth = getAuth(app); 
        
        // Используем initializeFirestore с авто-определением Long Polling для обхода блокировок
        const db = initializeFirestore(app, {
            experimentalAutoDetectLongPolling: true
        });
        
        let fbUser = null; 

        // ─── Надёжная система ID: храним ВСЕ известные идентификаторы ───────
        // Возвращает «канонический» ID для записи/чтения основного документа,
        // но getAllKnownIds() отдаёт полный список для синхронизации во все документы.
        function resolveUserId(userObj) {
            const tgU = window.Telegram && window.Telegram.WebApp && window.Telegram.WebApp.initDataUnsafe ? window.Telegram.WebApp.initDataUnsafe.user : null;
            
            // Сохраняем ТГ-ID отдельно, если он есть
            if (tgU && tgU.id) {
                localStorage.setItem('known_tg_id', String(tgU.id));
            }
            // Google-ID сохраняется в _applyGoogleUser → localStorage 'google_uid'
            
            // Канонический приоритет: TG > Google > старый stable > новый анонимный
            const knownTg = localStorage.getItem('known_tg_id');
            const googleUid = localStorage.getItem('google_uid');
            const oldStable = localStorage.getItem('stable_student_id');
            
            let canonical;
            if (knownTg) {
                canonical = knownTg;
            } else if (googleUid) {
                canonical = 'google_' + googleUid;
            } else if (oldStable) {
                canonical = oldStable;
            } else {
                canonical = userObj ? userObj.uid : 'anon_' + Date.now();
            }
            
            localStorage.setItem('stable_student_id', canonical);
            return canonical;
        }
        
        // Возвращает массив ВСЕХ известных ID пользователя (для записи во все документы)
        function getAllKnownIds() {
            const ids = new Set();
            const knownTg = localStorage.getItem('known_tg_id');
            const googleUid = localStorage.getItem('google_uid');
            const oldStable = localStorage.getItem('stable_student_id');
            
            if (knownTg) ids.add(knownTg);
            if (googleUid) ids.add('google_' + googleUid);
            if (oldStable && !oldStable.startsWith('anon_')) ids.add(oldStable);
            
            // Фильтруем дубли и невалидные
            return [...ids].filter(id => id && id.length > 0);
        }

        // Normalize name for comparison: lowercase, collapse spaces, remove punctuation
        function normalizeName(n) {
            return (n || '').trim().toLowerCase().replace(/[^а-яёa-z0-9\s]/gi, '').replace(/\s+/g,' ');
        }
        // Compute similarity of two normalized names (Jaccard on trigrams)
        function nameSimilarity(a, b) {
            if (!a || !b) return 0;
            if (a === b) return 1;
            const trigrams = s => { const t = new Set(); for(let i=0;i<s.length-2;i++) t.add(s.slice(i,i+3)); return t; };
            const ta = trigrams(a), tb = trigrams(b);
            let inter = 0; ta.forEach(t => { if(tb.has(t)) inter++; });
            return inter / (ta.size + tb.size - inter || 1);
        }
        function mergeTwo(base, extra) {
            if ((extra.totalSolved || 0) > (base.totalSolved || 0)) {
                base.totalSolved = extra.totalSolved;
                if (extra.fullStateJson && extra.fullStateJson.length > 20) base.fullStateJson = extra.fullStateJson;
            } else if (extra.fullStateJson && extra.fullStateJson.length > 20 && (!base.fullStateJson || base.fullStateJson.length <= 20)) {
                base.fullStateJson = extra.fullStateJson;
            }
            base.timeSpent = Math.max(base.timeSpent || 0, extra.timeSpent || 0);
            base.lastActive = Math.max(base.lastActive || 0, extra.lastActive || 0);
            // Keep longer/more complete name
            if ((extra.name || '').length > (base.name || '').length && !/(аноним|без имени)/i.test(extra.name)) {
                base.name = extra.name;
            }
        }
        function mergeDuplicateStudents(students) {
            // Step 1: filter zero-activity
            let active = students.filter(s => (s.totalSolved || 0) > 0);
            // Step 2: exact match by normalized name + username
            const exactMap = {};
            const result = [];
            active.forEach(st => {
                const nm = normalizeName(st.name);
                const isAnon = !nm || nm === 'аноним' || nm.includes('без имени') || nm.includes('ученик');
                if (isAnon) {
                    // anonymous: try to keep as-is, will be fuzzy-merged below
                    result.push({ ...st, _nm: nm, _anon: true });
                    return;
                }
                const k = nm + '|' + (st.username || '').trim().toLowerCase();
                if (!exactMap[k]) { exactMap[k] = { ...st, _nm: nm, _anon: false }; result.push(exactMap[k]); }
                else { mergeTwo(exactMap[k], st); }
            });
            // Step 3: fuzzy-merge anonymous entries with existing named entries
            const namedResult = result.filter(s => !s._anon);
            const anonEntries = result.filter(s => s._anon);
            anonEntries.forEach(anon => {
                // Try to find a named entry whose tgId or uid partially matches
                const anonUid = (anon.tgId || anon.uid || '').toString();
                let matched = null;
                // Match by tgId overlap (handles google_ vs numeric tgId)
                if (anonUid) {
                    matched = namedResult.find(n => {
                        const nUid = (n.tgId || n.uid || '').toString();
                        return nUid && (nUid === anonUid || nUid.includes(anonUid) || anonUid.includes(nUid));
                    });
                }
                if (matched) { mergeTwo(matched, anon); }
                else { namedResult.push(anon); } // keep as separate if no match
            });
            // Step 4: fuzzy-merge named entries with high similarity (>0.82)
            const finalResult = [];
            const used = new Set();
            namedResult.forEach((st, i) => {
                if (used.has(i)) return;
                finalResult.push(st);
                namedResult.forEach((other, j) => {
                    if (j <= i || used.has(j)) return;
                    if (nameSimilarity(st._nm, other._nm) > 0.82) {
                        mergeTwo(st, other);
                        used.add(j);
                    }
                });
            });
            // Clean up internal fields
            finalResult.forEach(s => { delete s._nm; delete s._anon; });
            return finalResult;
        }
        
        /*
         * ✅ НЕОБХОДИМЫЕ ИНДЕКСЫ FIRESTORE (создать в Firebase Console → Firestore → Indexes):
         *
         * Коллекция: artifacts/{appId}/public/data/students
         *   1. totalSolved  DESC                              (для openGlobalTopModal)
         *   2. weeklyScore  DESC                              (для loadStudentLeaderboard)
         *   3. classCode    ASC  + totalSolved DESC           (для loadClassProgress с фильтром)
         *   4. googleEmail  ASC                               (для loadProgressFromCloud)
         *
         * Коллекция: artifacts/{appId}/public/data/matches
         *   5. status ASC + createdAt ASC                     (для startDuelSearchDb)
         *
         * Документ-кэш лидерборда (обновляется клиентом раз в 10 мин):
         *   artifacts/{appId}/public/data/leaderboards/global
         *   Поля: { top: Array<{name,username,totalSolved}>, updatedAt: number }
         *   → При 1000 игроков: 1 чтение/открытие топа вместо 20.
         *
         * СБРОС WEEKLY SCORE (каждый понедельник через Cloud Functions):
         *   Обнулять поле weeklyScore у всех документов students.
         *   Пример Cloud Function (Node.js):
         *   exports.resetWeeklyScores = functions.pubsub
         *     .schedule('every monday 00:00').onRun(async () => {
         *       const snap = await admin.firestore()
         *         .collection('artifacts/APP_ID/public/data/students').get();
         *       const batch = admin.firestore().batch();
         *       snap.docs.forEach(d => batch.update(d.ref, { weeklyScore: 0 }));
         *       await batch.commit();
         *     });
         */
        
        const initAuth = async () => {
            if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
                try {
                    await signInWithCustomToken(auth, __initial_auth_token);
                } catch(e) {
                    console.warn("Ошибка токена (custom-token-mismatch), используем анонимный вход:", e.message);
                    try {
                        await signInAnonymously(auth);
                    } catch(err) {
                        console.error("Auth init error:", err);
                    }
                }
            } else {
                try {
                    await signInAnonymously(auth);
                } catch(e) {
                    console.error("Auth init error:", e);
                }
            }
        };
        // ─── Google auth helper ──────────────────────────────────────────────────
        function _applyGoogleUser(user) {
            const gName  = user.displayName || '';
            const gEmail = user.email       || '';
            // Set Google name as fallback only if no manual name is set
            if (gName && !localStorage.getItem('student_manual_name'))
                localStorage.setItem('student_manual_name', gName);
            // Сохраняем google_uid — resolveUserId() сам выберет канонический ID
            localStorage.setItem('google_uid',   user.uid);
            localStorage.setItem('google_email', gEmail);
            // Пересчитываем канонический ID (учтёт и ТГ, и Google)
            resolveUserId(user);
            const statusEl = $('profile-google-status');
            if (statusEl) {
                statusEl.textContent  = '✅ ' + (gEmail || gName);
                statusEl.className    = 'text-[11px] font-bold text-emerald-600 mt-1';
            }
            const nameEl = $('profile-name-input');
            if (nameEl) {
                // Show the stored name (could be from TG/cloud), or Google name as fallback
                const storedName = localStorage.getItem('student_manual_name') || gName;
                if (storedName && !nameEl.value) nameEl.value = storedName;
            }
            const classEl = $('profile-class-code');
            if (classEl) {
                const storedClass = localStorage.getItem('student_class_code') || '';
                if (storedClass && !classEl.value) classEl.value = storedClass;
            }
        }

        // ─── Main auth bootstrap ─────────────────────────────────────────────────
        // ВАЖНО: getRedirectResult нужно вызывать ДО signInAnonymously,
        // иначе анонимный вход перебивает сессию редиректа.
        const _bootAuth = async () => {
            let googleSignedIn = false;
            try {
                const result = await getRedirectResult(auth);
                if (result && result.user) {
                    googleSignedIn = true;
                    _applyGoogleUser(result.user);
                    // Тост и синхронизация — в onAuthStateChanged (когда fbUser уже установлен)
                    window._pendingGoogleToast = result.user.email || result.user.displayName || '';
                }
            } catch (e) {
                console.error('getRedirectResult error:', e);

                // ── Аккаунт Google уже привязан к другой анонимной сессии Firebase.
                //    Решение — войти под этим аккаунтом напрямую через credential из ошибки.
                if (e.code === 'auth/credential-already-in-use' ||
                    e.code === 'auth/email-already-in-use') {
                    try {
                        const credential = GoogleAuthProvider.credentialFromError(e);
                        if (credential) {
                            const fallbackResult = await signInWithCredential(auth, credential);
                            googleSignedIn = true;
                            _applyGoogleUser(fallbackResult.user);
                            window._pendingGoogleToast = fallbackResult.user.email || fallbackResult.user.displayName || '';
                        }
                    } catch (fallbackErr) {
                        console.error('signInWithCredential fallback error:', fallbackErr);
                        setTimeout(() => showToast('❌', 'Не удалось войти через Google. Попробуйте ещё раз.', 'bg-rose-500', 'border-rose-700'), 800);
                    }
                } else if (e.code && e.code !== 'auth/redirect-cancelled-by-user'
                                   && e.code !== 'auth/user-cancelled') {
                    setTimeout(() => showToast('❌', 'Ошибка Google: ' + (e.code || e.message), 'bg-rose-500', 'border-rose-700'), 800);
                }
            }

            // Если Google-аккаунт не найден — запускаем стандартный анонимный вход
            if (!googleSignedIn) {
                await initAuth();
            }
        };
        _bootAuth();

        // ─── Google Sign-In (popup with redirect fallback) ─────────────────────
        // signInWithPopup works in most environments including WebViews.
        // If popup is blocked, falls back to signInWithRedirect.
        window.signInWithGoogle = async function() {
            const provider = new GoogleAuthProvider();
            provider.setCustomParameters({ prompt: 'select_account' });
            // Remember old ID and local data before switching
            const oldStudentId = localStorage.getItem('stable_student_id') || '';
            const localStateJson = localStorage.getItem('ege_final_storage_v4') || '{}';
            const localSolved = window.state.stats.totalSolvedEver || 0;
            
            async function _handleGoogleResult(user) {
                _applyGoogleUser(user);
                const newId = resolveUserId(user); // now google_<uid>
                
                // loadProgressFromCloud will search by google_<uid>, then by email, then by name
                // This handles the case where data is under TG ID
                await window.loadProgressFromCloud();
                
                const cloudLoaded = window.state.stats.totalSolvedEver || 0;
                
                // If cloud had no data but local had some (from anon session), push to cloud
                if (cloudLoaded === 0 && localSolved > 0) {
                    // Restore local state that might have been overwritten
                    try {
                        const parsed = JSON.parse(localStateJson);
                        const statsFields = ['streak','totalSolvedEver','solvedByTask','flashcardsSolved','eraStats','factStreaks','hwFlashcardsToSolve','totalTimeSpent','bestSpeedrunScore','dailyStats','achievements','achievementsData'];
                        statsFields.forEach(k => { if (parsed[k] !== undefined) window.state.stats[k] = parsed[k]; });
                        if (parsed.mistakesPool) window.state.mistakesPool = parsed.mistakesPool;
                        localStorage.setItem('ege_final_storage_v4', localStateJson);
                    } catch(e) {}
                    await window.syncProgressToCloud();
                } else if (cloudLoaded > 0) {
                    // Cloud was loaded — also sync back to ensure data is under google_<uid>
                    await window.syncProgressToCloud();
                }
                
                // Also migrate old TG document to include googleEmail so future lookups work
                if (oldStudentId && oldStudentId !== newId) {
                    try {
                        const studentsCol = collection(db, 'artifacts', appId, 'public', 'data', 'students');
                        const oldDoc = await getDoc(doc(studentsCol, oldStudentId));
                        if (oldDoc.exists() && (oldDoc.data().totalSolved || 0) > 0) {
                            await setDoc(doc(studentsCol, oldStudentId), { googleEmail: user.email || '' }, { merge: true });
                        }
                    } catch(e) {}
                }
                
                updateGlobalUI();
                if (window.updateProgressBars) updateProgressBars();
            }
            
            try {
                const result = await signInWithPopup(auth, provider);
                if (result && result.user) {
                    await _handleGoogleResult(result.user);
                    showToast('✅', 'Вход через Google: ' + (result.user.email || result.user.displayName || ''), 'bg-emerald-500', 'border-emerald-700');
                }
            } catch (e) {
                if (e.code === 'auth/popup-blocked' || e.code === 'auth/popup-closed-by-user' || e.code === 'auth/cancelled-popup-request') {
                    try {
                        await signInWithRedirect(auth, provider);
                    } catch (redirectErr) {
                        console.error('signInWithRedirect fallback error:', redirectErr);
                        showToast('❌', 'Не удалось войти: ' + (redirectErr.code || redirectErr.message), 'bg-rose-500', 'border-rose-700');
                    }
                } else if (e.code === 'auth/credential-already-in-use' || e.code === 'auth/email-already-in-use') {
                    try {
                        const credential = GoogleAuthProvider.credentialFromError(e);
                        if (credential) {
                            const fallbackResult = await signInWithCredential(auth, credential);
                            await _handleGoogleResult(fallbackResult.user);
                            showToast('✅', 'Вход через Google: ' + (fallbackResult.user.email || ''), 'bg-emerald-500', 'border-emerald-700');
                        }
                    } catch (credErr) {
                        console.error('signInWithCredential error:', credErr);
                        showToast('❌', 'Не удалось войти через Google', 'bg-rose-500', 'border-rose-700');
                    }
                } else {
                    console.error('signInWithGoogle error:', e);
                    showToast('❌', 'Ошибка Google: ' + (e.code || e.message), 'bg-rose-500', 'border-rose-700');
                }
            }
        };

        // Хранилище для отписок от HW-слушателей
        let _hwUnsubscribers = [];
        
        onAuthStateChanged(auth, async (u) => { 
            fbUser = u; 
            if (u) {
                // ── Сохраняем Google-данные если вход через Google
                const googleProvider = (u.providerData || []).find(p => p.providerId === 'google.com');
                if (googleProvider) {
                    const gEmail = googleProvider.email || u.email || '';
                    const gName  = googleProvider.displayName || u.displayName || '';
                    localStorage.setItem('google_email', gEmail);
                    localStorage.setItem('google_uid',   u.uid);
                    // НЕ перезаписываем stable_student_id напрямую — resolveUserId разберётся
                    if (gName && !localStorage.getItem('student_manual_name'))
                        localStorage.setItem('student_manual_name', gName);
                    _applyGoogleUser(u);
                }

                // Загружаем прогресс из облака (ПЕРЕД синхронизацией — иначе затрём облако нулями)
                // Это также подтягивает known_tg_id из найденного документа
                await window.loadProgressFromCloud();
                
                // Update UI with loaded name/class
                const nameEl = $('profile-name-input');
                const classEl = $('profile-class-code');
                if (nameEl && localStorage.getItem('student_manual_name')) nameEl.value = localStorage.getItem('student_manual_name');
                if (classEl && localStorage.getItem('student_class_code')) classEl.value = localStorage.getItem('student_class_code');
                // Update Google status UI
                if (googleProvider) {
                    const statusEl = $('profile-google-status');
                    const gEmail = localStorage.getItem('google_email') || '';
                    if (statusEl && gEmail) {
                        statusEl.textContent = '✅ ' + gEmail;
                        statusEl.className = 'text-[11px] font-bold text-emerald-600 mt-1';
                    }
                }

                // Тост о входе через Google (если был редирект)
                if (window._pendingGoogleToast) {
                    showToast('✅', 'Вход через Google: ' + window._pendingGoogleToast, 'bg-emerald-500', 'border-emerald-700');
                    window._pendingGoogleToast = null;
                }

                // Теперь синхронизируем актуальный (возможно только что загруженный) прогресс в облако
                window.syncProgressToCloud(); 
                
                // ── Receiver for Homework — слушаем ВСЕ известные документы ──
                // Сначала отписываемся от старых слушателей
                _hwUnsubscribers.forEach(unsub => { try { unsub(); } catch(e) {} });
                _hwUnsubscribers = [];
                
                const hwIds = getAllKnownIds();
                const canonicalId = resolveUserId(u);
                if (!hwIds.includes(canonicalId)) hwIds.push(canonicalId);
                
                function _handleHwSnapshot(docSnap) {
                    if (!docSnap.exists()) return;
                    const data = docSnap.data();
                    const t3 = data.hwAssignTask3 || 0;
                    const t4 = data.hwAssignTask4 || 0;
                    const t5 = data.hwAssignTask5 || 0;
                    const t7 = data.hwAssignTask7 || 0;
                    const totalHw = t3 + t4 + t5 + t7;
                    if (totalHw > 0) {
                        window.state.stats.hwTask3 = t3;
                        window.state.stats.hwTask4 = t4;
                        window.state.stats.hwTask5 = t5;
                        window.state.stats.hwTask7 = t7;
                        window.state.stats.hwFlashcardsToSolve = totalHw;
                        window.state.isHomeworkMode = true;
                        if (data.assignedTeacherHwDeadline) {
                            localStorage.setItem('teacher_hw_deadline', data.assignedTeacherHwDeadline);
                        }
                        setDoc(docSnap.ref, { hwAssignTask3: 0, hwAssignTask4: 0, hwAssignTask5: 0, hwAssignTask7: 0, assignedTeacherHw: 0 }, { merge: true }).catch(console.error);
                        const parts = [];
                        if (t3 > 0) parts.push(`🔗№3: ${t3}`);
                        if (t4 > 0) parts.push(`📍№4: ${t4}`);
                        if (t5 > 0) parts.push(`👤№5: ${t5}`);
                        if (t7 > 0) parts.push(`🎨№7: ${t7}`);
                        const dlStr = data.assignedTeacherHwDeadline ? ` · до ${new Date(data.assignedTeacherHwDeadline + 'T00:00:00').toLocaleDateString('ru-RU')}` : '';
                        showToast('🔥', `ДЗ: ${parts.join(', ')}${dlStr}`, 'bg-rose-500', 'border-rose-700');
                        saveProgress();
                        if(window.updateGlobalUI) window.updateGlobalUI();
                    } else if (data.assignedTeacherHw && data.assignedTeacherHw > 0) {
                        window.state.stats.hwFlashcardsToSolve = data.assignedTeacherHw;
                        window.state.isHomeworkMode = true;
                        if (data.assignedTeacherHwTask) localStorage.setItem('teacher_hw_task', data.assignedTeacherHwTask);
                        setDoc(docSnap.ref, { assignedTeacherHw: 0 }, { merge: true }).catch(console.error);
                        showToast('🔥', `ДЗ: ${data.assignedTeacherHw} строк`, 'bg-rose-500', 'border-rose-700');
                        saveProgress();
                        if(window.updateGlobalUI) window.updateGlobalUI();
                    }
                }
                
                const studentsCol = collection(db, 'artifacts', appId, 'public', 'data', 'students');
                for (const hwId of hwIds) {
                    const unsub = onSnapshot(doc(studentsCol, hwId), _handleHwSnapshot, (error) => console.error("HW snapshot error for " + hwId + ":", error));
                    _hwUnsubscribers.push(unsub);
                }
                console.log(`[Sync] HW-слушатели подключены к: [${hwIds.join(', ')}]`);
            }
        });

        // PvP FIREBASE DUEL LOGIC
        // ✅ FIX: Используем runTransaction для атомарного захвата слота player2
        // Это исключает Race Condition когда двое одновременно присоединяются к одному матчу
        let duelUnsubscribe = null;
        window.startDuelSearchDb = async function() {
            if (!fbUser || !db) return showToast('❌', 'Подключитесь к сети', 'bg-rose-500', 'border-rose-700');
            window.state.duel = { active: false, searching: true, matchId: null, isPlayer1: false, oppName: '', myScore: 0, oppScore: 0, myCombo: 0, oppCombo: 0 };
            
            const myUid = resolveUserId(fbUser);
            let myName = localStorage.getItem('student_manual_name') || 'Игрок';
            if (myName.length > 12) myName = myName.substring(0, 10) + '..';

            const matchesRef = collection(db, 'artifacts', appId, 'public', 'data', 'matches');
            
            try {
                // ✅ FIX: Ищем матчи со статусом 'waiting' точечным запросом (не getDocs всей коллекции)
                const waitingQuery = query(matchesRef, where('status', '==', 'waiting'), limit(10));
                const snapshot = await getDocs(waitingQuery);
                
                const now = Date.now();
                let candidateIds = [];
                snapshot.forEach(docSnap => {
                    const data = docSnap.data();
                    if (data.player1 && data.player1.uid !== myUid && (now - data.createdAt < 30000)) {
                        candidateIds.push(docSnap.id);
                    }
                });

                let joinedMatchId = null;

                // ✅ FIX: runTransaction — атомарно проверяем что player2 ещё свободен перед записью
                for (const candidateId of candidateIds) {
                    try {
                        await runTransaction(db, async (transaction) => {
                            const matchDocRef = doc(matchesRef, candidateId);
                            const matchSnap = await transaction.get(matchDocRef);
                            if (!matchSnap.exists()) throw new Error('match_gone');
                            const matchData = matchSnap.data();
                            // Проверяем внутри транзакции: слот ещё свободен?
                            if (matchData.status !== 'waiting' || matchData.player2 !== null) {
                                throw new Error('slot_taken');
                            }
                            // Атомарно занимаем слот
                            transaction.update(matchDocRef, {
                                status: 'playing',
                                player2: { uid: myUid, name: myName, score: 0, combo: 0 },
                                startTime: Date.now() + 4000
                            });
                        });
                        joinedMatchId = candidateId;
                        break; // Успешно присоединились
                    } catch (txErr) {
                        if (txErr.message === 'slot_taken' || txErr.message === 'match_gone') {
                            continue; // Слот занят — пробуем следующий
                        }
                        throw txErr; // Другая ошибка — пробрасываем
                    }
                }

                if (joinedMatchId) {
                    window.state.duel.isPlayer1 = false;
                    window.state.duel.matchId = joinedMatchId;
                    listenToDuel(joinedMatchId, myUid);
                } else {
                    // Не нашли свободный матч — создаём свой
                    window.state.duel.isPlayer1 = true;
                    const newMatch = await addDoc(matchesRef, {
                        status: 'waiting',
                        createdAt: Date.now(),
                        player1: { uid: myUid, name: myName, score: 0, combo: 0 },
                        player2: null,
                        startTime: 0
                    });
                    window.state.duel.matchId = newMatch.id;
                    listenToDuel(newMatch.id, myUid);
                }
            } catch(e) {
                console.error("Ошибка поиска дуэли:", e);
                showToast('❌', 'Сервер недоступен (Офлайн)', 'bg-rose-500', 'border-rose-700');
                window.cancelDuelSearch();
            }
        };

        function listenToDuel(matchId, myUid) {
            // ✅ FIX: Всегда отписываемся от предыдущего слушателя перед созданием нового
            if (duelUnsubscribe) {
                try { duelUnsubscribe(); } catch(e) {}
                duelUnsubscribe = null;
            }
            const matchesRef = collection(db, 'artifacts', appId, 'public', 'data', 'matches');
            duelUnsubscribe = onSnapshot(doc(matchesRef, matchId), (docSnap) => {
                if (!docSnap.exists()) {
                    window.cancelDuelSearch('Соперник вышел');
                    return;
                }
                const data = docSnap.data();
                
                if (data.status === 'playing' && window.state.duel.searching) {
                    window.state.duel.searching = false;
                    const opp = window.state.duel.isPlayer1 ? data.player2 : data.player1;
                    window.state.duel.oppName = opp ? opp.name : 'Соперник';
                    window.initDuelStart(data.startTime);
                }
                
                if (data.status === 'playing' && !window.state.duel.searching) {
                    const opp = window.state.duel.isPlayer1 ? data.player2 : data.player1;
                    if (opp) {
                        window.state.duel.oppScore = opp.score || 0;
                        window.state.duel.oppCombo = opp.combo || 0;
                        window.updateDuelUI();
                    }
                }
                
                // ✅ FIX: Автоматически отписываемся когда матч завершён
                if (data.status === 'finished') {
                    if (duelUnsubscribe) { try { duelUnsubscribe(); } catch(e) {} duelUnsubscribe = null; }
                }
            }, (error) => {
                console.error(error);
                window.cancelDuelSearch('Ошибка связи');
            });
        }

        // ✅ FIX: Функция теперь async с правильным await — без молчаливых падений
        window.updateDuelScoreDb = async function(score, combo) {
            if (!db || !window.state.duel.matchId || !fbUser) return;
            const matchesRef = collection(db, 'artifacts', appId, 'public', 'data', 'matches');
            try {
                await updateDoc(doc(matchesRef, window.state.duel.matchId), {
                    [window.state.duel.isPlayer1 ? 'player1' : 'player2']: { 
                        uid: resolveUserId(fbUser), 
                        name: localStorage.getItem('student_manual_name') || 'Игрок', 
                        score: score, 
                        combo: combo 
                    }
                });
            } catch(e) { console.error('[Duel] updateDuelScoreDb error:', e); }
        };

        window.cancelDuelDb = async function() {
            // ✅ FIX: Всегда чистим слушатель первым делом, вне зависимости от состояния
            if (duelUnsubscribe) { try { duelUnsubscribe(); } catch(e) {} duelUnsubscribe = null; }
            if (!db || !window.state.duel.matchId) return;
            
            try {
                const matchesRef = collection(db, 'artifacts', appId, 'public', 'data', 'matches');
                if (window.state.duel.searching && window.state.duel.isPlayer1) {
                    await deleteDoc(doc(matchesRef, window.state.duel.matchId));
                } else if (window.state.duel.active) {
                    await updateDoc(doc(matchesRef, window.state.duel.matchId), { status: 'finished' });
                }
            } catch(e) { console.error(e); }
            window.state.duel = { active: false, searching: false, matchId: null, isPlayer1: false, oppName: '', myScore: 0, oppScore: 0, myCombo: 0, oppCombo: 0 };
        };
        
        // ✅ FIX: Очистка слушателей при уходе со страницы (кнопка «Назад», закрытие вкладки)
        window.addEventListener('beforeunload', () => {
            if (duelUnsubscribe) { try { duelUnsubscribe(); } catch(e) {} duelUnsubscribe = null; }
            _hwUnsubscribers.forEach(unsub => { try { unsub(); } catch(e) {} });
            _hwUnsubscribers = [];
        });
        
        // ─── Вспомогательные функции кабинета учителя ───

        function computeStudentData(s, monStr, monday) {
            let state = {}; try { state = JSON.parse(s.fullStateJson || '{}'); } catch(e) {}
            const stats = state.stats || state || {};
            const streak = stats.streak || state.streak || 0;
            const timeSpentMin = Math.floor((stats.totalTimeSpent || state.totalTimeSpent || 0) / 60);

            let learnedCount = 0;
            Object.values(stats.factStreaks || state.factStreaks || {}).forEach(v => {
                if (v.level > 0 || v.streak >= 3) learnedCount++;
            });

            const eraNames = { early: 'Древность', '18th': 'XVIII в.', '19th': 'XIX в.', '20th': 'XX в.' };
            const rawEra = stats.eraStats || {};

            // Поддержка обоих форматов: старый flat и новый per-task
            const isNewFormat = rawEra.task3 || rawEra.task4 || rawEra.task5 || rawEra.task7;
            const taskDefs = [
                { key: 'task4', label: '📍 №4 География', color: '#3b82f6' },
                { key: 'task5', label: '👤 №5 Личности',  color: '#8b5cf6' },
                { key: 'task7', label: '🎨 №7 Культура',  color: '#f59e0b' },
            ];

            // Общая точность (по всем заданиям и эпохам) для карточки
            let totalCorrect = 0, totalAttempts = 0;
            // eraData — сводная по всем заданиям (для мини-графика эпох в карточке)
            const eraData = {};
            for (const eKey of Object.keys(eraNames)) {
                let c = 0, tot = 0;
                if (isNewFormat) {
                    for (const tk of ['task3','task4','task5','task7']) {
                        const e = (rawEra[tk] || {})[eKey] || {};
                        c   += e.correct || 0;
                        tot += e.total   || 0;
                    }
                } else {
                    const e = rawEra[eKey] || {};
                    c   = e.correct || 0;
                    tot = e.total   || 0;
                }
                totalCorrect  += c;
                totalAttempts += tot;
                eraData[eKey] = { name: eraNames[eKey], correct: c, total: tot, pct: tot > 0 ? Math.round((c/tot)*100) : null };
            }
            const accuracy = totalAttempts > 0 ? Math.round((totalCorrect / totalAttempts) * 100) : null;

            // Per-task breakdown для PDF (with learned counts)
            const allFactStreaks = stats.factStreaks || state.factStreaks || {};
            const taskStats = taskDefs.map(({ key, label, color }) => {
                const taskEra = isNewFormat ? (rawEra[key] || {}) : (key === 'task4' ? rawEra : {});
                let tc = 0, tt = 0;
                const eras = [];
                for (const [eKey, eName] of Object.entries(eraNames)) {
                    const e = taskEra[eKey] || { correct: 0, total: 0 };
                    tc += e.correct || 0;
                    tt += e.total   || 0;
                    if (e.total > 0) eras.push({ name: eName, correct: e.correct, total: e.total, pct: Math.round((e.correct/e.total)*100) });
                }
                const learned = countLearnedForTask(key, allFactStreaks);
                return { key, label, color, correct: tc, total: tt, pct: tt > 0 ? Math.round((tc/tt)*100) : null, eras, learned };
            }).filter(t => t.total > 0 || t.learned > 0);

            const dStat = stats.dailyStats || state.dailyStats || {};
            let wScore = 0, wScoreTask4 = 0;
            const now = new Date();
            const last7 = [];
            for (let i = 6; i >= 0; i--) {
                const d = new Date(now); d.setDate(d.getDate() - i);
                const dStr = d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
                const val = (dStat[dStr] && dStat[dStr].solved) || 0;
                const valT4 = (dStat[dStr] && dStat[dStr].solvedTask4) || 0;
                if (dStr >= monStr) { wScore += val; wScoreTask4 += valT4; }
                last7.push({ date: dStr, val, t4: (dStat[dStr] && dStat[dStr].solvedTask4) || 0, t5: (dStat[dStr] && dStat[dStr].solvedTask5) || 0, t7: (dStat[dStr] && dStat[dStr].solvedTask7) || 0, mins: dStat[dStr] ? Math.floor((dStat[dStr].timeSpent || 0) / 60) : 0 });
            }
            // No totalSolved fallback — must come from actual dailyStats

            const daysSinceActive = s.lastActive ? Math.floor((Date.now() - s.lastActive) / 86400000) : 999;
            const lastActiveDate = s.lastActive ? new Date(s.lastActive) : null;
            const lastActiveStr = lastActiveDate
                ? `${lastActiveDate.toLocaleDateString('ru-RU')} ${String(lastActiveDate.getHours()).padStart(2,'0')}:${String(lastActiveDate.getMinutes()).padStart(2,'0')}`
                : 'Давно';

            let weakEra = null, weakPct = 101;
            for (const e of Object.values(eraData)) {
                if (e.total >= 5 && e.pct !== null && e.pct < weakPct) { weakPct = e.pct; weakEra = e; }
            }

            return { ...s, streak, timeSpentMin, learnedCount, accuracy, eraData, taskStats, wScore, wScoreTask4, last7, dStat,
                     daysSinceActive, isToday: daysSinceActive === 0, atRisk: daysSinceActive >= 3,
                     lastActiveStr, weakEra, totalCorrect, totalAttempts };
        }

        function renderMiniBar(last7) {
            const max = Math.max(...last7.map(d => d.val), 1);
            const days = ['Пн','Вт','Ср','Чт','Пт','Сб','Вс'];
            return last7.map((d, i) => {
                const h = Math.max(3, Math.round((d.val / max) * 28));
                const color = d.val === 0 ? '#e5e7eb' : i === 6 ? '#3b82f6' : '#6ee7b7';
                const dayIdx = (new Date(d.date).getDay() + 6) % 7;
                return `<div style="display:flex;flex-direction:column;align-items:center;gap:2px;flex:1">
                    <div title="${d.date}: ${d.val} строк" style="width:100%;max-width:14px;height:${h}px;background:${color};border-radius:3px 3px 0 0"></div>
                    <span style="font-size:8px;color:#9ca3af;font-weight:700">${days[dayIdx]}</span>
                </div>`;
            }).join('');
        }

        function renderEraRows(eraData) {
            return Object.values(eraData).map(e => {
                if (!e.total) return '';
                const c = e.pct >= 80 ? '#10b981' : e.pct >= 60 ? '#f59e0b' : '#f43f5e';
                return `<div style="display:flex;align-items:center;gap:6px;margin-bottom:3px">
                    <span style="font-size:9px;color:#6b7280;font-weight:700;min-width:68px">${e.name}</span>
                    <div style="flex:1;height:6px;background:#f1f5f9;border-radius:3px;overflow:hidden">
                        <div style="height:100%;width:${e.pct}%;background:${c};border-radius:3px"></div>
                    </div>
                    <span style="font-size:9px;font-weight:700;color:${c};min-width:28px;text-align:right">${e.pct}%</span>
                </div>`;
            }).join('');
        }

        function renderDailyDetail(last7) {
            const days = ['Пн','Вт','Ср','Чт','Пт','Сб','Вс'];
            return last7.filter(d => d.val > 0).reverse().map(d => {
                const dayIdx = (new Date(d.date).getDay() + 6) % 7;
                const dateStr = new Date(d.date).toLocaleDateString('ru-RU', {day:'2-digit', month:'2-digit'});
                const parts = [];
                if (d.t4) parts.push(`<span style="color:#3b82f6">📍${d.t4}</span>`);
                if (d.t5) parts.push(`<span style="color:#8b5cf6">👤${d.t5}</span>`);
                if (d.t7) parts.push(`<span style="color:#f59e0b">🎨${d.t7}</span>`);
                const taskStr = parts.length ? parts.join(' ') : `<span style="color:#3b82f6">${d.val}</span>`;
                return `<div style="display:flex;justify-content:space-between;align-items:center;font-size:9px;padding:3px 0;border-bottom:1px solid #f8fafc">
                    <span style="font-weight:700;color:#94a3b8;min-width:30px">${dateStr}</span>
                    <span style="font-weight:700">${taskStr}</span>
                    <span style="color:#94a3b8;font-weight:600">${d.mins}м</span>
                </div>`;
            }).join('') || '<div style="font-size:9px;color:#94a3b8;padding:4px 0">Нет данных</div>';
        }

        function renderStudentCard(s, idx) {
            const safeUid  = (s.uid  || '').replace(/'/g, "\\'");
            const safeName = (s.name || 'Без имени').replace(/'/g, "\\'").replace(/"/g, '&quot;');
            const medal    = idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : `<span style="color:#9ca3af;font-size:12px">#${idx+1}</span>`;
            const timeStr  = s.timeSpentMin >= 60 ? `${Math.floor(s.timeSpentMin/60)}ч ${s.timeSpentMin%60}м` : `${s.timeSpentMin}м`;
            const accStr   = s.accuracy !== null ? `${s.accuracy}%` : '—';
            const accColor = s.accuracy === null ? '#9ca3af' : s.accuracy >= 80 ? '#10b981' : s.accuracy >= 60 ? '#f59e0b' : '#f43f5e';
            const atRiskBadge = s.atRisk
                ? `<span style="font-size:9px;font-weight:700;background:#fef2f2;color:#ef4444;border:1px solid #fecaca;padding:2px 6px;border-radius:4px">⚠️ ${s.daysSinceActive}д без входа</span>` : '';
            const todayBadge = s.isToday
                ? `<span style="font-size:9px;font-weight:700;background:#f0fdf4;color:#16a34a;border:1px solid #bbf7d0;padding:2px 6px;border-radius:4px">🟢 онлайн сегодня</span>` : '';
            const weakBlock = s.weakEra
                ? `<div style="margin-top:6px;font-size:10px;color:#9ca3af;font-weight:700">📍 Слабая тема: <span style="color:#f43f5e">${s.weakEra.name} — ${s.weakEra.pct}%</span></div>` : '';

            return `<div class="bg-white dark:bg-[#1e1e1e] rounded-2xl p-4 shadow-sm border border-gray-100 dark:border-[#2c2c2c] flex flex-col">
                <div style="display:flex;justify-content:space-between;align-items:flex-start;padding-bottom:10px;border-bottom:1px solid #f1f5f9;gap:8px">
                    <div style="display:flex;align-items:center;gap:8px;flex:1;min-width:0">
                        <span style="font-size:18px;flex-shrink:0">${medal}</span>
                        <div style="min-width:0">
                            <div class="dark:text-gray-200" style="font-weight:900;font-size:13px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${s.name || 'Без имени'}</div>
                            <div style="font-size:9px;color:#94a3b8;margin-top:1px">${s.lastActiveStr}</div>
                        </div>
                    </div>
                    <div style="display:flex;gap:4px;flex-wrap:wrap;justify-content:flex-end;flex-shrink:0">${atRiskBadge}${todayBadge}</div>
                </div>
                <div style="display:grid;grid-template-columns:repeat(5,1fr);gap:6px;padding:10px 0;border-bottom:1px solid #f1f5f9;text-align:center">
                    <div><div style="font-size:8px;color:#94a3b8;font-weight:700;text-transform:uppercase">Решено</div><div style="font-size:13px;font-weight:900;color:#3b82f6">${s.totalSolved||0}</div></div>
                    <div><div style="font-size:8px;color:#94a3b8;font-weight:700;text-transform:uppercase">Неделя</div><div style="font-size:13px;font-weight:900;color:#8b5cf6">${s.wScore}</div></div>
                    <div><div style="font-size:8px;color:#94a3b8;font-weight:700;text-transform:uppercase">Выучено</div><div style="font-size:13px;font-weight:900;color:#10b981">${s.learnedCount}</div></div>
                    <div><div style="font-size:8px;color:#94a3b8;font-weight:700;text-transform:uppercase">Стрик</div><div style="font-size:13px;font-weight:900;color:#f59e0b">${s.streak}🔥</div></div>
                    <div><div style="font-size:8px;color:#94a3b8;font-weight:700;text-transform:uppercase">Точность</div><div style="font-size:13px;font-weight:900;color:${accColor}">${accStr}</div></div>
                </div>
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;padding:10px 0;border-bottom:1px solid #f1f5f9">
                    <div>
                        <div style="font-size:8px;color:#94a3b8;font-weight:700;text-transform:uppercase;margin-bottom:6px">Активность 7 дней</div>
                        <div style="display:flex;align-items:flex-end;gap:2px;height:40px">${renderMiniBar(s.last7)}</div>
                    </div>
                    <div>
                        <div style="font-size:8px;color:#94a3b8;font-weight:700;text-transform:uppercase;margin-bottom:6px">Точность по эпохам</div>
                        ${renderEraRows(s.eraData) || '<div style="font-size:9px;color:#94a3b8;padding-top:4px">Нет данных</div>'}
                        ${weakBlock}
                    </div>
                </div>
                <div style="padding:8px 0;border-bottom:1px solid #f1f5f9">
                    <div style="font-size:8px;color:#94a3b8;font-weight:700;text-transform:uppercase;margin-bottom:4px">Подневная статистика</div>
                    ${renderDailyDetail(s.last7)}
                </div>
                <div style="display:flex;gap:8px;flex-wrap:wrap;padding:8px 0 4px;font-size:9px;color:#94a3b8;font-weight:700">
                    <span>⏱ В игре: <b style="color:#a78bfa">${timeStr}</b></span>
                    <span>📝 Попыток: <b style="color:#64748b">${s.totalAttempts||0}</b></span>
                    <span>✅ Верных: <b style="color:#10b981">${s.totalCorrect||0}</b></span>
                </div>
                <div style="display:flex;gap:6px;padding-top:8px;border-top:1px solid #f1f5f9">
                    <button onclick="window.promptAssignHw('${safeUid}','${safeName}')" class="flex-1 bg-rose-50 text-rose-600 hover:bg-rose-100 dark:bg-rose-900/20 dark:text-rose-400 py-2 rounded-xl text-[10px] font-black uppercase tracking-wider transition-colors active:scale-95">📝 ДЗ</button>
                    <button onclick="window.downloadStudentPDF('${safeUid}')" class="flex-1 bg-blue-50 text-blue-600 hover:bg-blue-100 dark:bg-blue-900/20 dark:text-blue-400 py-2 rounded-xl text-[10px] font-black uppercase tracking-wider transition-colors active:scale-95">📄 Отчёт</button>
                </div>
            </div>`;
        }

        window._cachedStudents = [];

        window.sortAndRenderStudents = function() {
            const st = window._cachedStudents;
            if (!st || !st.length) return;
            const sort = document.getElementById('teacher-sort-select')?.value || 'total';
            const sorted = [...st].sort((a, b) => {
                if (sort === 'weekly')    return (b.wScore||0)       - (a.wScore||0);
                if (sort === 'streak')    return (b.streak||0)       - (a.streak||0);
                if (sort === 'learned')   return (b.learnedCount||0) - (a.learnedCount||0);
                if (sort === 'accuracy')  return (b.accuracy||0)     - (a.accuracy||0);
                if (sort === 'lastActive') return (b.lastActive||0)  - (a.lastActive||0);
                return (b.totalSolved||0) - (a.totalSolved||0);
            });
            const cont = document.getElementById('teacher-class-stats');
            if (cont) cont.innerHTML = sorted.map((s, i) => renderStudentCard(s, i)).join('');
        };

        window.downloadStudentPDF = async function(uid) {
            const s = window._cachedStudents.find(x => x.uid === uid);
            if (!s) return;

            // Parse fullStateJson to extract mistakes list
            let fullState = {};
            try { fullState = JSON.parse(s.fullStateJson || '{}'); } catch(e) {}
            const mistakesPool = fullState.mistakesPool || [];
            const factStreaks = fullState.factStreaks || s.factStreaks || {};

            // Determine database sizes
            const task4Total = typeof bigData !== 'undefined' ? bigData.length : 0;
            const task5Total = typeof task5Data !== 'undefined' ? task5Data.length : 0;
            const task7Total = window.task7Data ? window.task7Data.length : 0;
            const task4Learned = countLearnedForTask('task4', factStreaks);
            const task5Learned = countLearnedForTask('task5', factStreaks);
            const task7Learned = countLearnedForTask('task7', factStreaks);

            const timeStr = s.timeSpentMin >= 60 ? `${Math.floor(s.timeSpentMin/60)}ч ${s.timeSpentMin%60}м` : `${s.timeSpentMin}м`;
            const accStr = s.accuracy !== null ? `${s.accuracy}%` : '—';
            const accColor = s.accuracy === null ? '#9ca3af' : s.accuracy >= 80 ? '#10b981' : s.accuracy >= 60 ? '#f59e0b' : '#f43f5e';

            // ─── Ленивая загрузка jsPDF — не грузим при старте, только по запросу ──
            if (typeof window.jspdf === 'undefined' && typeof jspdf === 'undefined') {
                showToast('⏳', 'Загружаем PDF-модуль...', 'bg-blue-500', 'border-blue-700');
                try {
                    await new Promise((resolve, reject) => {
                        const sc = document.createElement('script');
                        sc.src = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
                        sc.onload = resolve;
                        sc.onerror = () => reject(new Error('jsPDF load failed'));
                        document.head.appendChild(sc);
                    });
                } catch(err) {
                    showToast('❌', 'Ошибка загрузки PDF-модуля', 'bg-rose-500', 'border-rose-700');
                    return;
                }
            }
            const { jsPDF } = window.jspdf || jspdf;
            const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
            const PW = 210, PH = 297, M = 14, CW = PW - M * 2;
            let y = M;

            // ── helpers ──────────────────────────────────────────────────────────
            const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
            function needSpace(mm) { if (y + mm > PH - M) { doc.addPage(); y = M; } }
            function hline(yy, r, g, b) { doc.setDrawColor(r||229,g||231,b||235); doc.setLineWidth(0.3); doc.line(M, yy, M + CW, yy); }
            function labelVal(lbl, val, x, yy, lw, vColor) {
                doc.setFont('helvetica','bold'); doc.setFontSize(8); doc.setTextColor(100,116,139);
                doc.text(lbl, x, yy);
                doc.setFont('helvetica','bold'); doc.setFontSize(14); doc.setTextColor(...(vColor||[30,41,59]));
                doc.text(String(val), x, yy + 5.5);
            }
            function sectionTitle(title) {
                needSpace(10);
                hline(y); y += 4;
                doc.setFont('helvetica','bold'); doc.setFontSize(11); doc.setTextColor(30,41,59);
                doc.text(title, M, y); y += 6;
            }
            function bar(x, yy, w, pct, colorArr) {
                doc.setFillColor(241,245,249); doc.roundedRect(x, yy, w, 3, 1, 1, 'F');
                if (pct > 0) { doc.setFillColor(...colorArr); doc.roundedRect(x, yy, clamp(w * pct / 100, 1, w), 3, 1, 1, 'F'); }
            }
            function pctColor(p) { return p >= 80 ? [16,185,129] : p >= 60 ? [245,158,11] : [244,63,94]; }

            // ── Header ───────────────────────────────────────────────────────────
            doc.setFillColor(37,99,235); doc.roundedRect(M, y, CW, 16, 3, 3, 'F');
            doc.setFont('helvetica','bold'); doc.setFontSize(13); doc.setTextColor(255,255,255);
            doc.text('Отчёт: Тренажёр ЕГЭ История', M + 4, y + 6.5);
            doc.setFont('helvetica','normal'); doc.setFontSize(8); doc.setTextColor(191,219,254);
            doc.text(new Date().toLocaleDateString('ru-RU'), M + 4, y + 12.5);
            y += 20;

            // ── Student name + last active ────────────────────────────────────────
            doc.setFont('helvetica','bold'); doc.setFontSize(15); doc.setTextColor(30,41,59);
            doc.text(s.name || 'Без имени', M, y); y += 5;
            doc.setFont('helvetica','normal'); doc.setFontSize(8); doc.setTextColor(148,163,184);
            doc.text('Последний вход: ' + s.lastActiveStr, M, y); y += 8;

            // ── Stats grid (2 rows × 3 cols) ────────────────────────────────────
            const stats6 = [
                { l: 'Решено',    v: s.totalSolved||0,    c: [59,130,246] },
                { l: 'Выучено',   v: s.learnedCount||0,   c: [16,185,129] },
                { l: 'Стрик',     v: (s.streak||0)+'',    c: [245,158,11] },
                { l: 'За неделю', v: s.wScore||0,          c: [139,92,246] },
                { l: 'Точность',  v: accStr,               c: accColor === '#9ca3af' ? [148,163,184] : accColor === '#10b981' ? [16,185,129] : accColor === '#f59e0b' ? [245,158,11] : [244,63,94] },
                { l: 'Время',     v: timeStr,              c: [167,139,250] },
            ];
            const cellW = CW / 3, cellH = 13;
            stats6.forEach((st, i) => {
                const cx = M + (i % 3) * cellW, cy = y + Math.floor(i / 3) * (cellH + 2);
                doc.setFillColor(248,250,252); doc.roundedRect(cx, cy, cellW - 2, cellH, 2, 2, 'F');
                doc.setDrawColor(226,232,240); doc.setLineWidth(0.2); doc.roundedRect(cx, cy, cellW - 2, cellH, 2, 2, 'S');
                doc.setFont('helvetica','bold'); doc.setFontSize(7); doc.setTextColor(100,116,139);
                doc.text(st.l.toUpperCase(), cx + (cellW-2)/2, cy + 3.5, { align: 'center' });
                doc.setFont('helvetica','bold'); doc.setFontSize(13); doc.setTextColor(...st.c);
                doc.text(String(st.v), cx + (cellW-2)/2, cy + 10, { align: 'center' });
            });
            y += (cellH + 2) * 2 + 4;

            // ── Learned per task ─────────────────────────────────────────────────
            sectionTitle('Выучено фактов по заданиям');
            const lt = [
                { l: '№4 География', v: task4Learned, tot: task4Total, c: [59,130,246] },
                { l: '№5 Личности',  v: task5Learned, tot: task5Total, c: [139,92,246] },
                { l: '№7 Культура',  v: task7Learned, tot: task7Total, c: [245,158,11] },
            ];
            const ltW = CW / 3;
            lt.forEach((t, i) => {
                const cx = M + i * ltW;
                doc.setFillColor(248,250,252); doc.roundedRect(cx, y, ltW - 2, 16, 2, 2, 'F');
                doc.setDrawColor(226,232,240); doc.setLineWidth(0.2); doc.roundedRect(cx, y, ltW - 2, 16, 2, 2, 'S');
                doc.setFont('helvetica','bold'); doc.setFontSize(7); doc.setTextColor(100,116,139);
                doc.text(t.l, cx + (ltW-2)/2, y + 4, { align: 'center' });
                doc.setFont('helvetica','bold'); doc.setFontSize(14); doc.setTextColor(...t.c);
                doc.text(String(t.v), cx + (ltW-2)/2, y + 11, { align: 'center' });
                doc.setFont('helvetica','normal'); doc.setFontSize(7); doc.setTextColor(148,163,184);
                doc.text('из ' + t.tot, cx + (ltW-2)/2, y + 14.5, { align: 'center' });
            });
            y += 20;

            // ── Era accuracy ─────────────────────────────────────────────────────
            sectionTitle('Точность по эпохам');
            Object.values(s.eraData).filter(e => e.total > 0).forEach(e => {
                needSpace(9);
                const pc = e.pct; const cc = pctColor(pc);
                doc.setFont('helvetica','bold'); doc.setFontSize(8); doc.setTextColor(107,114,128);
                doc.text(e.name, M, y + 2.5);
                bar(M + 52, y, CW - 52 - 22, pc, cc);
                doc.setFont('helvetica','bold'); doc.setFontSize(8); doc.setTextColor(...cc);
                doc.text(pc + '%', M + CW - 1, y + 2.5, { align: 'right' });
                if (s.weakEra && s.weakEra.name === e.name) {
                    doc.setFont('helvetica','normal'); doc.setFontSize(7); doc.setTextColor(239,68,68);
                    doc.text('(слабая тема)', M + CW - 28, y + 2.5);
                }
                y += 7;
            });

            // ── Activity 7 days ──────────────────────────────────────────────────
            sectionTitle('Активность за 7 дней');
            const maxV2 = Math.max(...s.last7.map(d => d.val), 1);
            const bW = CW / 7 - 2, barMaxH = 20;
            const days7 = ['Пн','Вт','Ср','Чт','Пт','Сб','Вс'];
            needSpace(barMaxH + 10);
            s.last7.forEach((d, i) => {
                const bx = M + i * (CW / 7);
                const bh = Math.max(1, Math.round((d.val / maxV2) * barMaxH));
                const by = y + barMaxH - bh;
                const cc = d.val === 0 ? [229,231,235] : i === 6 ? [59,130,246] : [110,231,183];
                doc.setFillColor(...cc); doc.roundedRect(bx, by, bW, bh, 1, 1, 'F');
                if (d.val > 0) {
                    doc.setFont('helvetica','bold'); doc.setFontSize(6.5); doc.setTextColor(100,116,139);
                    doc.text(String(d.val), bx + bW/2, by - 1, { align: 'center' });
                }
                const dayIdx = (new Date(d.date).getDay() + 6) % 7;
                doc.setFont('helvetica','normal'); doc.setFontSize(7); doc.setTextColor(156,163,175);
                doc.text(days7[dayIdx], bx + bW/2, y + barMaxH + 4, { align: 'center' });
            });
            y += barMaxH + 9;

            // ── Task stats breakdown ──────────────────────────────────────────────
            if (s.taskStats && s.taskStats.length > 0) {
                sectionTitle('Разбивка по типам заданий');
                s.taskStats.forEach(tk => {
                    needSpace(10);
                    const pc = tk.pct !== null ? tk.pct : 0;
                    const cc = tk.pct !== null ? pctColor(pc) : [148,163,184];
                    doc.setFont('helvetica','bold'); doc.setFontSize(9); doc.setTextColor(30,41,59);
                    doc.text(tk.label, M, y + 3);
                    doc.setFont('helvetica','bold'); doc.setFontSize(9); doc.setTextColor(...cc);
                    doc.text((tk.pct !== null ? pc + '%' : '—') + ' (' + tk.correct + '/' + tk.total + ')', M + CW, y + 3, { align: 'right' });
                    bar(M, y + 4.5, CW, pc, cc);
                    y += 11;
                    tk.eras.forEach(era => {
                        needSpace(7);
                        const ec = pctColor(era.pct);
                        doc.setFont('helvetica','normal'); doc.setFontSize(7.5); doc.setTextColor(107,114,128);
                        doc.text(era.name, M + 6, y + 2.5);
                        bar(M + 52, y, CW - 52 - 18, era.pct, ec);
                        doc.setFont('helvetica','bold'); doc.setFontSize(7.5); doc.setTextColor(...ec);
                        doc.text(era.pct + '%', M + CW, y + 2.5, { align: 'right' });
                        y += 6;
                    });
                    y += 2;
                });
            }

            // ── Mistakes ─────────────────────────────────────────────────────────
            if (mistakesPool.length > 0) {
                sectionTitle('Ошибки (' + mistakesPool.length + ')');
                const shown = mistakesPool.slice(0, 50);
                shown.forEach((m, i) => {
                    needSpace(7);
                    doc.setFont('helvetica','bold'); doc.setFontSize(7.5); doc.setTextColor(244,63,94);
                    doc.text(String(i + 1) + '.', M, y + 2.5);
                    const taskLabel = m.task === 'task7' ? '№7' : m.task === 'task5' ? '№5' : m.task === 'task3' ? '№3' : '№4';
                    doc.setFont('helvetica','bold'); doc.setFontSize(7); doc.setTextColor(100,116,139);
                    doc.text('[' + taskLabel + ']', M + 6, y + 2.5);
                    let mText = '';
                    if (m.task === 'task7') mText = m.fact.culture + ' → ' + m.fact.trait;
                    else if (m.task === 'task5') mText = m.fact.event + ' → ' + m.fact.person;
                    else if (m.task === 'task3') mText = m.fact.process + ' → ' + m.fact.fact;
                    else mText = m.fact.geo + ' | ' + m.fact.year + ' | ' + m.fact.event;
                    doc.setFont('helvetica','normal'); doc.setFontSize(7.5); doc.setTextColor(30,41,59);
                    const lines = doc.splitTextToSize(mText, CW - 18);
                    doc.text(lines, M + 18, y + 2.5);
                    y += Math.max(6, lines.length * 3.8);
                });
                if (mistakesPool.length > 50) {
                    doc.setFont('helvetica','normal'); doc.setFontSize(7); doc.setTextColor(148,163,184);
                    doc.text('...и ещё ' + (mistakesPool.length - 50) + ' ошибок', M, y); y += 5;
                }
            }

            // ── Footer ───────────────────────────────────────────────────────────
            const pageCount = doc.internal.getNumberOfPages();
            for (let p = 1; p <= pageCount; p++) {
                doc.setPage(p);
                doc.setFont('helvetica','normal'); doc.setFontSize(7); doc.setTextColor(148,163,184);
                doc.text('Тренажёр ЕГЭ История | uid: ' + (s.uid||'') + ' | стр. ' + p + '/' + pageCount, PW/2, PH - 6, { align: 'center' });
            }

            const safeName = (s.name||'ученик').replace(/[^а-яёА-ЯЁa-zA-Z0-9_\s]/g,'').replace(/\s+/g,'_');
            doc.save('Отчёт_' + safeName + '_' + new Date().toISOString().split('T')[0] + '.pdf');
            showToast('📄', 'PDF отчёт скачан!', 'bg-blue-500', 'border-blue-700');
        };

        window.loadClassProgress = async function() {
            if (!db) return;
            const tc  = document.getElementById('teacher-class-code-input').value.trim();
            const cont  = document.getElementById('teacher-class-stats');
            const wCont = document.getElementById('weekly-class-stats');
            cont.innerHTML = '<p class="text-center py-4 text-xs font-bold text-gray-500">Загрузка...</p>';
            if (wCont) wCont.innerHTML = '<p class="text-center py-4 text-xs font-bold text-gray-500">Загрузка...</p>';

            try {
                const now    = new Date();
                const day    = now.getDay() || 7;
                const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - day + 1);
                const monStr = monday.getFullYear() + '-' + String(monday.getMonth()+1).padStart(2,'0') + '-' + String(monday.getDate()).padStart(2,'0');

                const studentsCol = collection(db, 'artifacts', appId, 'public', 'data', 'students');
                const filterClass = document.getElementById('teacher-filter-class')?.checked;
                
                // ✅ FIX: Точечный запрос с фильтром по классу или limit(200) для "всех"
                let firestoreQuery;
                if (filterClass && tc) {
                    firestoreQuery = query(studentsCol, where('classCode', '==', tc), orderBy('totalSolved', 'desc'), limit(200));
                } else {
                    firestoreQuery = query(studentsCol, orderBy('totalSolved', 'desc'), limit(200));
                }
                
                const qS = await getDocs(firestoreQuery);
                let st = [];
                qS.forEach(docSnap => {
                    const d = docSnap.data(); d.uid = docSnap.id;
                    st.push(d);
                });

                const enriched = st.map(s => computeStudentData(s, monStr, monday));
                enriched.sort((a,b) => (b.totalSolved||0) - (a.totalSolved||0));
                window._cachedStudents = enriched;

                // Сводка
                const summaryEl = document.getElementById('teacher-class-summary');
                if (enriched.length && summaryEl) {
                    summaryEl.classList.remove('hidden');
                    document.getElementById('summary-count').textContent  = enriched.length;
                    document.getElementById('summary-avg').textContent    = Math.round(enriched.reduce((s,x)=>s+(x.totalSolved||0),0)/enriched.length);
                    document.getElementById('summary-active').textContent = enriched.filter(x=>x.isToday).length;
                    document.getElementById('summary-atrisk').textContent = enriched.filter(x=>x.atRisk).length;
                }

                if (enriched.length === 0) {
                    cont.innerHTML = '<p class="text-center py-4 text-xs font-bold text-gray-500">Ученики не найдены</p>';
                } else {
                    window.sortAndRenderStudents();
                }

                // Топ недели
                if (wCont) {
                    const weeklySt = [...enriched].sort((a,b)=>(b.wScoreTask4||0)-(a.wScoreTask4||0)).filter(s=>s.wScoreTask4>0);
                    let wHt = weeklySt.length
                        ? weeklySt.map((s,idx) => `<div class="bg-white dark:bg-[#1e1e1e] rounded-2xl p-4 shadow-sm border border-gray-100 dark:border-[#2c2c2c] flex justify-between items-center mb-2">
                            <div class="flex items-center gap-3"><span class="text-2xl font-black">${idx===0?'🥇':idx===1?'🥈':idx===2?'🥉':`<span class="text-gray-400 w-6 inline-block text-center text-lg">${idx+1}</span>`}</span><span class="font-black text-sm dark:text-gray-200">${s.name||'Без имени'}</span></div>
                            <span class="text-base font-black text-emerald-500 bg-emerald-50 dark:bg-emerald-900/20 px-3 py-1 rounded-xl">${s.wScoreTask4} стр.</span>
                          </div>`).join('')
                        : '<p class="text-center py-4 text-xs font-bold text-gray-500">На этой неделе пока нет активности</p>';
                    wCont.innerHTML = wHt;
                }
            } catch(e) {
                console.error(e);
                cont.innerHTML = '<p class="text-rose-500 text-xs font-bold text-center py-4">Нет подключения к серверу (Офлайн)</p>';
                if (wCont) wCont.innerHTML = '';
            }
        };

        window.loadStudentLeaderboard = async function() {
            const lc = document.getElementById('student-leaderboard-container');
            const ll = document.getElementById('student-leaderboard-list');
            if (!db || !lc || !ll) return;
            lc.classList.remove('hidden');
            ll.innerHTML = '<div class="text-center text-xs text-gray-400 py-2">⏳ Загрузка...</div>';
            try {
                // Берём всех студентов по totalSolved (этот индекс точно есть),
                // затем вычисляем weeklyScore клиентски — это надёжнее чем orderBy weeklyScore,
                // который пропускает документы без этого поля.
                const studentsCol = collection(db, 'artifacts', appId, 'public', 'data', 'students');
                const monday = new Date(); monday.setDate(monday.getDate() - monday.getDay() + 1); monday.setHours(0,0,0,0);
                const monStr = monday.toISOString().split('T')[0];

                // Пробуем взять из кэша loadClassProgress если учитель уже загрузил данные
                let students = window._cachedStudents || [];

                if (!students.length) {
                    // Прямой запрос: до 100 студентов, сортировка по totalSolved
                    const q = query(studentsCol, orderBy('totalSolved', 'desc'), limit(100));
                    const snap = await getDocs(q);
                    students = snap.docs.map(d => {
                        const raw = d.data();
                        // вычисляем wScore из fullStateJson
                        let wScore = raw.weeklyScore || 0; // используем поле если есть
                        try {
                            const st = JSON.parse(raw.fullStateJson || '{}');
                            const ds = (st.stats || st).dailyStats || {};
                            let computed = 0;
                            for (const day in ds) {
                                if (day >= monStr) {
                                    computed += (ds[day].solvedTask4||0)+(ds[day].solvedTask3||0)
                                              + (ds[day].solvedTask5||0)+(ds[day].solvedTask7||0)
                                              + (ds[day].solved||0);
                                }
                            }
                            if (computed > 0) wScore = computed; // предпочитаем computed
                        } catch(e2) {}
                        return { name: raw.name || 'Без имени', wScore };
                    });
                } else {
                    // Используем уже загруженные данные учителя
                    students = students.map(s => ({ name: s.name || 'Без имени', wScore: s.wScoreTask4 || 0 }));
                }

                const top = students
                    .filter(s => s.wScore > 0)
                    .sort((a,b) => b.wScore - a.wScore)
                    .slice(0, 10);

                const medals = ['🥇','🥈','🥉'];
                let ht = top.length
                    ? top.map((s,i) => `<div class="flex items-center gap-2 bg-white dark:bg-[#1e1e1e] p-2.5 rounded-xl border border-emerald-100 dark:border-emerald-900/40 mb-1.5">
                        <span class="text-sm w-6 text-center shrink-0">${medals[i]||i+1}</span>
                        <span class="flex-1 font-bold text-[12px] truncate dark:text-gray-200">${s.name}</span>
                        <span class="font-black text-[12px] text-emerald-600 dark:text-emerald-400 shrink-0">${s.wScore} стр.</span>
                      </div>`).join('')
                    : '<div class="text-center text-xs text-gray-500 font-bold py-2">На этой неделе пока нет активности</div>';
                ll.innerHTML = ht;
            } catch (e) {
                console.error('[loadStudentLeaderboard]', e);
                ll.innerHTML = '<div class="text-center text-xs text-rose-500 font-bold py-2">Нет подключения</div>';
            }
        };

        window.openGlobalTopModal = async function() {
            const cont = document.getElementById('global-top-container'); window.showModal('global-top-modal');
            if (!db) return;
            cont.innerHTML = '<p class="text-[10px] font-bold text-gray-500 text-center py-4">⏳ Загрузка...</p>';
            try {
                // ✅ FIX: Сначала пробуем кэш-документ (leaderboards/global) —
                // 1 чтение вместо 20 чтений. Если кэша нет — делаем прямой запрос.
                const lbCacheRef = doc(db, 'artifacts', appId, 'public', 'data', 'leaderboards', 'global');
                let tL = [];
                let fromCache = false;
                let cacheUpdatedAt = 0;
                try {
                    const cacheSnap = await getDoc(lbCacheRef);
                    if (cacheSnap.exists() && cacheSnap.data().top && cacheSnap.data().updatedAt > Date.now() - 15 * 60 * 1000) {
                        tL = cacheSnap.data().top;
                        cacheUpdatedAt = cacheSnap.data().updatedAt || 0;
                        fromCache = true;
                    }
                } catch(cacheErr) { /* Кэша нет — идём напрямую */ }

                if (!fromCache) {
                    // ✅ Уменьшен limit: 50 → 20 (снижает стоимость в 2.5 раза)
                    const studentsCol = collection(db, 'artifacts', appId, 'public', 'data', 'students');
                    const topQuery = query(studentsCol, orderBy('totalSolved', 'desc'), limit(20));
                    const qS = await getDocs(topQuery);
                    qS.forEach(docSnap => { tL.push(docSnap.data()); });
                }

                let ht = '<div class="flex flex-col gap-2">';
                tL.forEach((s, idx) => { 
                    ht += `<div class="bg-white dark:bg-[#1e1e1e] rounded-xl p-3 shadow-sm border border-gray-100 dark:border-[#2c2c2c] flex justify-between items-center transition-transform hover:-translate-y-0.5"><div class="flex items-center gap-3"><span class="text-xl sm:text-2xl drop-shadow-sm font-black">${idx===0?'🥇':(idx===1?'🥈':(idx===2?'🥉':`<span class="text-gray-400 w-5 inline-block text-center text-base">${idx+1}</span>`))}</span><div class="flex flex-col"><span class="font-black text-xs sm:text-sm text-gray-800 dark:text-gray-300 leading-tight">${s.name || 'Аноним'}</span>${s.username ? `<span class="text-[9px] font-bold text-blue-500 block leading-tight">@${s.username}</span>` : ''}</div></div><div class="text-right flex flex-col items-end"><span class="text-sm font-black text-examBlue dark:text-blue-400 bg-blue-50 dark:bg-blue-900/30 px-2 py-0.5 rounded-lg border border-blue-100 dark:border-blue-800/50">${s.totalSolved || 0}</span></div></div>`; 
                });
                if (fromCache) ht += `<div class="text-center text-[9px] text-gray-400 pt-1">Обновлено ${new Date(cacheUpdatedAt).toLocaleTimeString('ru-RU', {hour:'2-digit',minute:'2-digit'})}</div>`;
                ht += '</div>'; cont.innerHTML = ht;
            } catch (e) { 
                console.error(e);
                cont.innerHTML = '<p class="text-rose-500 text-xs font-bold text-center py-4">Нет подключения к серверу (Офлайн)</p>'; 
            }
        };

        window._assignHwDb = async function(studentId, num, task, deadline) {
            if (!db) return;
            const taskLabels = { task3: '№3 (Процессы)', task4: '№4 (География)', task5: '№5 (Личности)', task7: '№7 (Культура)' };
            const deadlineStr = deadline ? ` до ${new Date(deadline + 'T00:00:00').toLocaleDateString('ru-RU')}` : '';
            // Per-task fields so multiple assignments accumulate
            const taskField = { task3: 'hwAssignTask3', task4: 'hwAssignTask4', task5: 'hwAssignTask5', task7: 'hwAssignTask7' };
            const field = taskField[task] || 'hwAssignTask4';
            try {
                const ref = doc(db, 'artifacts', appId, 'public', 'data', 'students', studentId);
                const snap = await getDoc(ref);
                const existing = snap.exists() ? (snap.data()[field] || 0) : 0;
                const updates = {
                    [field]: existing + num,
                    assignedTeacherHwDeadline: deadline || null,
                    // Legacy field kept for backward compat
                    assignedTeacherHw: num,
                    assignedTeacherHwTask: task || 'task4'
                };
                await updateDoc(ref, updates);
                showToast('✅', `ДЗ: ${num} строк, задание ${taskLabels[task] || task}${deadlineStr}`, 'bg-emerald-500', 'border-emerald-700');
            } catch(e) {
                console.error(e);
                showToast('❌', 'Ошибка назначения ДЗ', 'bg-rose-500', 'border-rose-700');
            }
        };
        
        window.loadProgressFromCloud = async function() {
            if (!fbUser || !db) return;
            try {
                const studentsCol = collection(db, 'artifacts', appId, 'public', 'data', 'students');
                const canonicalId = resolveUserId(fbUser);
                
                let bestData = null;
                let bestSolved = 0;
                let bestDocId = null;
                
                // 1. Сначала читаем только ИЗВЕСТНЫЕ документы по прямым ID (точечные чтения)
                const knownIds = new Set([canonicalId]);
                const knownTg = localStorage.getItem('known_tg_id');
                const googleUid = localStorage.getItem('google_uid');
                if (knownTg) knownIds.add(knownTg);
                if (googleUid) knownIds.add('google_' + googleUid);
                
                for (const id of knownIds) {
                    try {
                        const snap = await getDoc(doc(studentsCol, id));
                        if (snap.exists()) {
                            const data = snap.data();
                            const solved = data.totalSolved || 0;
                            console.log(`[Sync] Документ ${id}: ${solved} задач`);
                            if (solved > bestSolved) {
                                bestData = data; bestSolved = solved; bestDocId = id;
                            }
                        }
                    } catch(e) { console.warn(`[Sync] Ошибка чтения документа ${id}:`, e); }
                }
                
                // 2. ✅ FIX: Если не нашли по ID — ищем по email ТОЧЕЧНЫМ запросом (НЕ getDocs всей коллекции!)
                if (!bestData || bestSolved === 0) {
                    const gEmail = localStorage.getItem('google_email') || fbUser.email || '';
                    if (gEmail) {
                        try {
                            const emailQuery = query(studentsCol, where('googleEmail', '==', gEmail), limit(5));
                            const emailSnap = await getDocs(emailQuery);
                            emailSnap.forEach(docSnap => {
                                const data = docSnap.data();
                                const docSolved = data.totalSolved || 0;
                                if (docSolved > bestSolved) {
                                    bestData = data; bestSolved = docSolved; bestDocId = docSnap.id;
                                    console.log(`[Sync] Найден по email ${gEmail}: ${docSolved} задач (doc: ${docSnap.id})`);
                                }
                            });
                        } catch(searchErr) {
                            console.error('[Sync] Ошибка поиска по email:', searchErr);
                        }
                    }
                }
                
                // 3. Загружаем найденные данные
                if (bestData) {
                    if (bestData.name && bestData.name !== 'Ученик' && !localStorage.getItem('student_manual_name')) {
                        localStorage.setItem('student_manual_name', bestData.name);
                        const nameEl = $('profile-name-input');
                        if (nameEl) nameEl.value = bestData.name;
                    }
                    if (bestData.classCode && !localStorage.getItem('student_class_code')) {
                        localStorage.setItem('student_class_code', bestData.classCode);
                        const classEl = $('profile-class-code');
                        if (classEl) classEl.value = bestData.classCode;
                    }
                    if (bestData.tgId && /^\d+$/.test(bestData.tgId)) {
                        localStorage.setItem('known_tg_id', bestData.tgId);
                    }
                    
                    const cloudSolved = bestSolved;
                    const localSolved = window.state.stats.totalSolvedEver || 0;
                    
                    const shouldLoad = bestData.fullStateJson && (cloudSolved > localSolved || localSolved === 0);
                    if (shouldLoad) {
                        try {
                            const cS = JSON.parse(bestData.fullStateJson);
                            const statsFields = ['streak','totalSolvedEver','solvedByTask','flashcardsSolved','eraStats','factStreaks','hwFlashcardsToSolve','totalTimeSpent','bestSpeedrunScore','dailyStats','achievements','achievementsData'];
                            statsFields.forEach(k => { if (cS[k] !== undefined) window.state.stats[k] = cS[k]; });
                            if (cS.mistakesPool) window.state.mistakesPool = cS.mistakesPool;
                            if (cS.hideLearned !== undefined) window.state.hideLearned = cS.hideLearned;
                            if (!window.state.stats.dailyStats) window.state.stats.dailyStats = {};
                            if (!window.state.stats.solvedByTask) window.state.stats.solvedByTask = { task3: 0, task4: 0, task5: 0, task7: 0 };
                            if (!window.state.stats.achievements) window.state.stats.achievements = [];
                            if (!window.state.stats.achievementsData) window.state.stats.achievementsData = { nightOwls: 0, earlyBirds: 0, hwDone: 0, hwPerfect: 0, maxMistakes: 0 };
                            localStorage.setItem('ege_final_storage_v4', bestData.fullStateJson);
                            console.log(`[Sync] Загружено из облака: ${cloudSolved} задач из документа ${bestDocId} (локально было: ${localSolved})`);
                        } catch(parseErr) {
                            console.error('[Sync] Ошибка парсинга fullStateJson:', parseErr);
                        }
                    }
                    if (window.updateGlobalUI) window.updateGlobalUI();
                    if (window.updateProgressBars) window.updateProgressBars();
                }
            } catch(e) { console.error('[Sync] loadProgressFromCloud error:', e); }
        };

        window.syncProgressToCloud = async function() {
            if (!fbUser || !db) return;
            const s = window.state.stats;
            if (!s) return;
            
            const nw = Date.now();
            const gEmail = localStorage.getItem('google_email') || '';
            const knownTg = localStorage.getItem('known_tg_id') || '';
            const googleUid = localStorage.getItem('google_uid');
            const googleId = googleUid ? 'google_' + googleUid : '';
            
            // ✅ FIX: Вычисляем weeklyScore здесь и храним как отдельное поле,
            // чтобы индексировать в Firestore для серверной сортировки лидерборда
            const dStat = s.dailyStats || {};
            const now2 = new Date();
            const day2 = now2.getDay() || 7;
            const monday2 = new Date(now2.getFullYear(), now2.getMonth(), now2.getDate() - day2 + 1);
            const monStr2 = monday2.getFullYear() + '-' + String(monday2.getMonth()+1).padStart(2,'0') + '-' + String(monday2.getDate()).padStart(2,'0');
            let weeklyScore = 0;
            for (const d in dStat) {
                if (d >= monStr2) {
                    weeklyScore += (dStat[d].solvedTask4 || 0)
                                + (dStat[d].solvedTask3 || 0)
                                + (dStat[d].solvedTask5 || 0)
                                + (dStat[d].solvedTask7 || 0)
                                + (dStat[d].solved || 0);  // старый формат до разбивки по заданиям
                }
            }
            
            const payload = {
                name: localStorage.getItem('student_manual_name') || 'Ученик',
                classCode: localStorage.getItem('student_class_code') || '',
                googleEmail: gEmail,
                knownTgId: knownTg,
                knownGoogleId: googleId,
                totalSolved: s.totalSolvedEver || 0,
                // ✅ weeklyScore как индексируемое поле (для orderBy в запросах лидерборда)
                weeklyScore: weeklyScore,
                // fullStateJson остаётся для совместимости, но основные поля — отдельно
                fullStateJson: localStorage.getItem('ege_final_storage_v4') || '{}',
                lastActive: nw
            };
            
            // ✅ FIX: Пишем ТОЛЬКО в один канонический документ — никаких Race Conditions
            const canonicalId = resolveUserId(fbUser);
            const studentsCol = collection(db, 'artifacts', appId, 'public', 'data', 'students');
            
            try {
                await setDoc(doc(studentsCol, canonicalId), { ...payload, tgId: canonicalId }, { merge: true });
                console.log(`[Sync] Записано в документ: ${canonicalId}`);
            } catch(e) {
                console.error('[Sync] write error', e);
                return; // Не обновляем кэш если основная запись упала
            }

            // ── Кэш лидерборда ────────────────────────────────────────────────
            // ✅ Клиентская стратегия: тот, кто синхронизируется, попутно обновляет
            // кэш-документ leaderboards/global. Это даёт свежий кэш без Cloud Functions.
            // Защита: не чаще 1 раза в 10 минут на устройство (localStorage throttle).
            // При 1000 активных игроков — максимум 6 обновлений кэша в минуту,
            // что стоит 6 записей × 20 чтений = 126 операций/мин (безопасно).
            const CACHE_TTL = 10 * 60 * 1000; // 10 минут
            const lastCacheUpdate = parseInt(localStorage.getItem('_lbCacheUpdatedAt') || '0');
            if (nw - lastCacheUpdate > CACHE_TTL) {
                try {
                    const topQuery = query(
                        studentsCol,
                        orderBy('totalSolved', 'desc'),
                        limit(20)
                    );
                    const topSnap = await getDocs(topQuery);
                    const topData = [];
                    topSnap.forEach(d => {
                        const sd = d.data();
                        // Храним только нужные поля — не весь документ
                        topData.push({
                            name:        sd.name        || 'Аноним',
                            username:    sd.username    || '',
                            totalSolved: sd.totalSolved || 0
                        });
                    });
                    const lbCacheRef = doc(db, 'artifacts', appId, 'public', 'data', 'leaderboards', 'global');
                    await setDoc(lbCacheRef, { top: topData, updatedAt: nw });
                    localStorage.setItem('_lbCacheUpdatedAt', String(nw));
                    console.log(`[Cache] Лидерборд обновлён: ${topData.length} игроков`);
                } catch(cacheErr) {
                    // Не критично — кэш обновится при следующей синхронизации
                    console.warn('[Cache] Ошибка обновления кэша лидерборда:', cacheErr);
                }
            }
        };
