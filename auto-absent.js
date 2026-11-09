const DB_URL = "https://e-absenmtlg-default-rtdb.asia-southeast1.firebasedatabase.app";

async function runAutoAbsent() {
    console.log("Memulai proses pengecekan Auto-Absen Alpa...");
    
    // 1. Ambil Waktu & Tanggal WITA
    const now = new Date();
    const dateStr = new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Makassar" }).format(now);
    
    // 2. Cek Hari Minggu
    const dayOfWeek = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Makassar" })).getDay();
    const isSunday = (dayOfWeek === 0);

    // 3. Cek Hari Libur dari Database
    const resHolidays = await fetch(`${DB_URL}/holidays.json`);
    const holidaysData = await resHolidays.json();
    const isHoliday = holidaysData ? Object.values(holidaysData).some(h => h.date === dateStr) : false;

    // 4. Cek Status Bypass Admin
    const resBypass = await fetch(`${DB_URL}/settings/isBypassActive.json`);
    const isBypassActive = (await resBypass.json()) || false;

    // Jika Hari Libur/Minggu & Bypass Mati -> Batalkan
    if ((isSunday || isHoliday) && !isBypassActive) {
        console.log(`[SKIPPED] Hari ini Libur / Minggu (${dateStr}). Eksekusi dibatalkan.`);
        await fetch(`${DB_URL}/system_status/last_cron_execution.json`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                date: dateStr,
                status: "SKIPPED_HOLIDAY",
                message: "Dilewati karena hari libur/Minggu"
            })
        });
        return;
    }

    // 5. Ambil Data Siswa & Log Kehadiran Hari Ini
    const resStudents = await fetch(`${DB_URL}/students.json`);
    const studentsData = await resStudents.json();
    const students = studentsData ? Object.values(studentsData) : [];

    const resLogs = await fetch(`${DB_URL}/attendance_logs.json`);
    const logsData = await resLogs.json();
    const logs = logsData ? Object.values(logsData) : [];
    const todayLogs = logs.filter(l => l.date === dateStr);

    let count = 0;
    const updates = {};

    // 6. Evaluasi Siswa yang Belum Absen
    students.forEach(s => {
        const hasLog = todayLogs.some(l => String(l.nisn) === String(s.nisn));
        if (!hasLog) {
            const id = Date.now() + Math.floor(Math.random() * 10000);
            updates[id] = {
                id: id,
                date: dateStr,
                time: "13:00:00 WITA",
                nisn: String(s.nisn),
                nama: s.nama,
                kelas: s.kelas,
                type: "ALPA",
                status: "TIDAK HADIR (ALPA)",
                method: "GitHub Actions Cron (13:00 WITA)"
            };
            count++;
        }
    });

    // 7. Simpan Log Alpa Baru ke Firebase
    if (count > 0) {
        await fetch(`${DB_URL}/attendance_logs.json`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(updates)
        });
    }

    // 8. Catat Pengingat Status Eksekusi Terakhir
    await fetch(`${DB_URL}/system_status/last_cron_execution.json`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            date: dateStr,
            status: "SUCCESS",
            total_alpa_created: count
        })
    });

    console.log(`[BERHASIL] Mencatat ${count} siswa Alpa untuk tanggal ${dateStr}.`);
}

runAutoAbsent().catch(console.error);
