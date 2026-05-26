import { useState } from "react";
import { MONTHS_LONG } from "../../constants";
import { nightCount } from "../../utils/dateUtils";

const IT_MONTHS = [
  "gennaio","febbraio","marzo","aprile","maggio","giugno",
  "luglio","agosto","settembre","ottobre","novembre","dicembre",
];

function fmtLong(isoDate) {
  if (!isoDate) return "—";
  const [, m, d] = isoDate.split("-");
  return `${parseInt(d, 10)} ${IT_MONTHS[parseInt(m, 10) - 1]}`;
}

export default function DateRangePicker({ checkin, checkout, onChange }) {
  const today    = new Date();
  const todayStr = today.toISOString().split("T")[0];

  const initYear  = checkin ? parseInt(checkin.slice(0, 4))     : today.getFullYear();
  const initMonth = checkin ? parseInt(checkin.slice(5, 7)) - 1 : today.getMonth();

  const [calYear,  setCalYear]  = useState(initYear);
  const [calMonth, setCalMonth] = useState(initMonth);

  function prevMonth() {
    if (calMonth === 0) { setCalMonth(11); setCalYear(y => y - 1); }
    else setCalMonth(m => m - 1);
  }
  function nextMonth() {
    if (calMonth === 11) { setCalMonth(0); setCalYear(y => y + 1); }
    else setCalMonth(m => m + 1);
  }

  const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();
  const firstDay    = ((new Date(calYear, calMonth, 1).getDay()) + 6) % 7;

  function handleDayClick(dateStr) {
    if (!checkin || (checkin && checkout)) {
      onChange(dateStr, "");
    } else {
      if (dateStr <= checkin) {
        onChange(dateStr, "");
      } else {
        onChange(checkin, dateStr);
      }
    }
  }

  const nights = checkin && checkout ? nightCount(checkin, checkout) : 0;

  return (
    <div style={{ marginBottom: "0.9rem" }}>

      {/* Riepilogo date */}
      <div style={{ background: "#0d0a07", border: "1px solid #2a2010", borderRadius: "10px", padding: "0.65rem 0.8rem", marginBottom: "0.6rem" }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "0.3rem", textAlign: "center" }}>

          <div>
            <div style={{ color: "#8a7a60", fontSize: "0.58rem", letterSpacing: "0.1em", textTransform: "uppercase", fontFamily: "'Playfair Display',serif", marginBottom: "0.2rem" }}>Check-in</div>
            <div style={{ color: checkin ? "#c9a96e" : "#3a3020", fontSize: "0.78rem", fontWeight: checkin ? "600" : "400" }}>
              {fmtLong(checkin)}
            </div>
          </div>

          <div>
            <div style={{ color: "#8a7a60", fontSize: "0.58rem", letterSpacing: "0.1em", textTransform: "uppercase", fontFamily: "'Playfair Display',serif", marginBottom: "0.2rem" }}>Check-out</div>
            <div style={{ color: checkout ? "#6ec99a" : "#3a3020", fontSize: "0.78rem", fontWeight: checkout ? "600" : "400" }}>
              {fmtLong(checkout)}
            </div>
          </div>

          <div>
            <div style={{ color: "#8a7a60", fontSize: "0.58rem", letterSpacing: "0.1em", textTransform: "uppercase", fontFamily: "'Playfair Display',serif", marginBottom: "0.2rem" }}>Notti</div>
            <div style={{ color: nights > 0 ? "#e8d5b0" : "#3a3020", fontSize: "0.78rem", fontWeight: nights > 0 ? "600" : "400" }}>
              {nights > 0 ? nights : "—"}
            </div>
          </div>

        </div>

        <div style={{ textAlign: "center", fontSize: "0.65rem", fontStyle: "italic", marginTop: "0.4rem", color: "#5a4a30" }}>
          {!checkin
            ? "Seleziona il check-in sul calendario"
            : !checkout
            ? "Ora seleziona il check-out"
            : ""}
        </div>
      </div>

      {/* Calendario */}
      <div style={{ background: "#0d0a07", border: "1px solid #2a2010", borderRadius: "12px", padding: "0.65rem" }}>

        {/* Navigazione mese */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.5rem" }}>
          <button type="button" onClick={prevMonth} style={{ background: "#1a1612", border: "1px solid #3a3020", borderRadius: "7px", padding: "0.28rem 0.7rem", color: "#c9a96e", cursor: "pointer", fontSize: "0.95rem", lineHeight: 1, fontWeight: "bold" }}>&#8249;</button>
          <span style={{ fontFamily: "'Playfair Display',serif", color: "#c9a96e", fontSize: "0.88rem" }}>
            {MONTHS_LONG[calMonth]} {calYear}
          </span>
          <button type="button" onClick={nextMonth} style={{ background: "#1a1612", border: "1px solid #3a3020", borderRadius: "7px", padding: "0.28rem 0.7rem", color: "#c9a96e", cursor: "pointer", fontSize: "0.95rem", lineHeight: 1, fontWeight: "bold" }}>&#8250;</button>
        </div>

        {/* Intestazioni giorni */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: "2px", marginBottom: "3px" }}>
          {["L","M","M","G","V","S","D"].map((d, i) => (
            <div key={i} style={{ textAlign: "center", color: i === 6 ? "#5a4832" : "#4a3a20", fontSize: "0.6rem", padding: "0.15rem 0", fontWeight: "700" }}>
              {d}
            </div>
          ))}
        </div>

        {/* Celle giorni */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: "2px" }}>
          {Array.from({ length: firstDay }).map((_, i) => (
            <div key={"e" + i} />
          ))}
          {Array.from({ length: daysInMonth }, (_, i) => i + 1).map(day => {
            const dateStr    = `${calYear}-${String(calMonth + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
            const isCheckin  = dateStr === checkin;
            const isCheckout = dateStr === checkout;
            const isInRange  = !!(checkin && checkout && dateStr > checkin && dateStr < checkout);
            const isToday    = dateStr === todayStr;
            const isSun      = ((firstDay + day - 1) % 7) === 6;

            let bg          = "#0d0a07";
            let txtColor    = isToday ? "#c9a96e" : isSun ? "#4e3d28" : "#6a5a40";
            let borderColor = isToday ? "#c9a96e55" : "#181410";
            let bRadius     = "6px";
            let fontWeight  = isToday ? "700" : "400";

            if (isCheckin) {
              bg = "#c9a96e"; txtColor = "#0a0806"; borderColor = "#c9a96e"; fontWeight = "700";
            } else if (isCheckout) {
              bg = "#6ec99a"; txtColor = "#0a0806"; borderColor = "#6ec99a"; fontWeight = "700";
            } else if (isInRange) {
              bg = "rgba(201,169,110,0.16)"; borderColor = "rgba(201,169,110,0.12)"; bRadius = "0";
            }

            return (
              <div
                key={day}
                onClick={() => handleDayClick(dateStr)}
                style={{ background: bg, border: `1px solid ${borderColor}`, borderRadius: bRadius,
                         minHeight: "34px", cursor: "pointer", display: "flex",
                         alignItems: "center", justifyContent: "center", userSelect: "none" }}
              >
                <span style={{ fontSize: "0.72rem", fontWeight, color: txtColor }}>{day}</span>
              </div>
            );
          })}
        </div>

      </div>
    </div>
  );
}
