const KOMODITAS = [
  { id: "cabai_rawit", label: "Cabai Rawit" },
  { id: "bawang_merah", label: "Bawang Merah" },
  { id: "cabai_besar", label: "Cabai Besar" },
];

export default function KomoditasSwitcher({ activeId, onChange }) {
  return (
    <div className="komoditas-switcher" role="tablist">
      {KOMODITAS.map((k) => (
        <button
          key={k.id}
          type="button"
          role="tab"
          aria-selected={k.id === activeId}
          className={
            k.id === activeId
              ? "komoditas-switcher__tab komoditas-switcher__tab--active"
              : "komoditas-switcher__tab"
          }
          onClick={() => onChange(k.id)}
        >
          {k.label}
        </button>
      ))}
    </div>
  );
}
