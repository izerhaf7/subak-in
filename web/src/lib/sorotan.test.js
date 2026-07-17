import { describe, it, expect } from "vitest";
import { sorotanHarga, mingguPuncakRisiko } from "./sorotan.js";
import { KOTA_IDS } from "./wilayah.js";

// Fixture kecil buatan tangan, BUKAN data asli: tes ini mengunci logikanya,
// bukan angka hari ini. Angka asli berubah tiap kali run_all.py jalan.
function mapDataOf(kabupaten) {
  return { komoditas_id: "cabai_rawit", kabupaten };
}

function kab(id, status_data, risk_mingguan = []) {
  return { id, nama: `Kab. ${id}`, status_data, risk_mingguan };
}

function fileHarga(id, rpList) {
  return {
    id,
    nama: `Kab. ${id}`,
    harga: { historis: rpList.map((rp, i) => ({ minggu: `2025-W${30 + i}`, rp })) },
  };
}

describe("sorotanHarga", () => {
  it("memilih kabupaten dengan penurunan TERBESAR, bukan yang pertama di array", () => {
    const mapData = mapDataOf([kab("a", "measured"), kab("b", "measured")]);
    const files = [
      fileHarga("a", [100, 90]), // turun 10%
      fileHarga("b", [100, 20]), // turun 80% <- ini yang harus menang
    ];
    expect(sorotanHarga(mapData, files).id).toBe("b");
  });

  it("mengabaikan kabupaten non-measured walau file-nya punya harga historis", () => {
    // Ini kasus `sumedang`: measured di file kabupaten, modeled di map.json.
    // map.json yang menang.
    const mapData = mapDataOf([kab("sumedang", "modeled"), kab("garut", "measured")]);
    const files = [
      { ...fileHarga("sumedang", [100, 5]), status_data: "measured" }, // turun 95%, harus DIABAIKAN
      fileHarga("garut", [100, 60]), // turun 40%
    ];
    expect(sorotanHarga(mapData, files).id).toBe("garut");
  });

  it("mengabaikan measured_stale — hanya measured murni yang dipakai", () => {
    const mapData = mapDataOf([kab("a", "measured_stale"), kab("b", "measured")]);
    const files = [fileHarga("a", [100, 1]), fileHarga("b", [100, 70])];
    expect(sorotanHarga(mapData, files).id).toBe("b");
  });

  it("mengembalikan puncak, dasar, persen, jumlah minggu jatuh, dan total minggu", () => {
    const mapData = mapDataOf([kab("a", "measured")]);
    const files = [fileHarga("a", [70000, 40000, 19850])];
    expect(sorotanHarga(mapData, files)).toEqual({
      id: "a",
      nama: "Kab. a",
      puncakRp: 70000,
      dasarRp: 19850,
      turunPersen: 72, // (1 - 19850/70000) * 100 = 71.6 -> dibulatkan 72
      nMingguJatuh: 2, // indeks puncak (0) ke indeks dasar (2)
      nMinggu: 3, // total panjang seri, beda dari nMingguJatuh
    });
  });

  it("BUG LAMA: dasar sebelum puncak (seri naik) TIDAK dilaporkan sebagai penurunan 80%", () => {
    // Math.max/Math.min butuh urutan waktu diabaikan: max=100, min=20, jadi
    // implementasi lama melaporkan "turun 80%" padahal harga NAIK dari 20 ke
    // 100. Maximum drawdown yang benar: tidak ada dasar SETELAH puncak
    // berjalan, jadi tidak ada penurunan sama sekali -> null.
    const mapData = mapDataOf([kab("a", "measured")]);
    const files = [fileHarga("a", [20, 100])];
    const hasil = sorotanHarga(mapData, files);
    expect(hasil).not.toEqual(expect.objectContaining({ turunPersen: 80 }));
    expect(hasil).toBeNull();
  });

  it("menemukan puncak-lalu-dasar dengan benar di tengah seri", () => {
    // 50 -> 100 (puncak) -> 40 (dasar): turun (1 - 40/100) * 100 = 60%,
    // jarak puncak(idx1) ke dasar(idx2) = 1 minggu.
    const mapData = mapDataOf([kab("a", "measured")]);
    const files = [fileHarga("a", [50, 100, 40])];
    expect(sorotanHarga(mapData, files)).toEqual({
      id: "a",
      nama: "Kab. a",
      puncakRp: 100,
      dasarRp: 40,
      turunPersen: 60,
      nMingguJatuh: 1,
      nMinggu: 3,
    });
  });

  it("mengecualikan kota dari kumpulan sorotan walau status_data measured", () => {
    // depok ada di KOTA_IDS. Kalau ikut dihitung, drawdown 90%-nya akan
    // menang atas garut (30%) — kota bukan wilayah produksi, dipetakan putih
    // "tidak dianalisis", jadi headline tidak boleh menyorotnya.
    const kotaId = "depok";
    expect(KOTA_IDS.has(kotaId)).toBe(true);
    const mapData = mapDataOf([kab(kotaId, "measured"), kab("garut", "measured")]);
    const files = [fileHarga(kotaId, [100, 10]), fileHarga("garut", [100, 70])];
    expect(sorotanHarga(mapData, files).id).toBe("garut");
  });

  it("mengembalikan null kalau tidak ada kabupaten measured sama sekali", () => {
    const mapData = mapDataOf([kab("a", "modeled")]);
    expect(sorotanHarga(mapData, [fileHarga("a", [100, 10])])).toBeNull();
  });

  it("melewati kabupaten yang harga historisnya kosong", () => {
    const mapData = mapDataOf([kab("a", "measured"), kab("b", "measured")]);
    const files = [fileHarga("a", []), fileHarga("b", [100, 50])];
    expect(sorotanHarga(mapData, files).id).toBe("b");
  });

  it("tidak membagi nol saat harga puncak 0", () => {
    const mapData = mapDataOf([kab("a", "measured")]);
    expect(sorotanHarga(mapData, [fileHarga("a", [0, 0])])).toBeNull();
  });

  it("tidak meledak saat mapData atau kabupatenFiles tidak ada", () => {
    expect(sorotanHarga(null, [])).toBeNull();
    expect(sorotanHarga(mapDataOf([kab("a", "measured")]), null)).toBeNull();
  });
});

describe("mingguPuncakRisiko", () => {
  it("mengembalikan minggu dengan jumlah skor tertinggi", () => {
    const mapData = mapDataOf([
      kab("a", "measured", [{ minggu: 29, skor: 10 }, { minggu: 46, skor: 80 }]),
      kab("b", "modeled", [{ minggu: 29, skor: 5 }, { minggu: 46, skor: 60 }]),
    ]);
    expect(mingguPuncakRisiko(mapData)).toEqual({ minggu: 46, skorTotal: 140 });
  });

  it("mengecualikan kota dari penjumlahan", () => {
    // depok ada di KOTA_IDS. Kalau ikut dihitung, W29 (200) akan menang atas W46 (80).
    const mapData = mapDataOf([
      kab("garut", "measured", [{ minggu: 29, skor: 10 }, { minggu: 46, skor: 80 }]),
      kab("depok", "modeled", [{ minggu: 29, skor: 190 }, { minggu: 46, skor: 0 }]),
    ]);
    expect(mingguPuncakRisiko(mapData)).toEqual({ minggu: 46, skorTotal: 80 });
  });

  it("mengembalikan null untuk daftar kabupaten kosong", () => {
    expect(mingguPuncakRisiko(mapDataOf([]))).toBeNull();
    expect(mingguPuncakRisiko(null)).toBeNull();
  });
});
