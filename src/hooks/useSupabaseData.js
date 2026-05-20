import { useState, useEffect } from "react";
import { supabase } from "../supabaseClient";
import { APT_ALL } from "../constants";
import { dbToBooking, bookingToDb } from "../utils/bookingUtils";

export default function useSupabaseData() {
  const [user, setUser] = useState(null);
  const [profileError, setProfileError] = useState(false);
  const [aptLoadError, setAptLoadError] = useState(false);
  const [bookings, setBookings] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [apartments, setApartments] = useState([]);
  const [loading, setLoading] = useState(true);

  async function handleSession(session) {
    setProfileError(false);
    console.log("[handleSession] uid:", session.user.id, "email:", session.user.email);
    const { data: profile, error } = await supabase.from("profiles").select("role").eq("id", session.user.id).single();
    console.log("[handleSession] profile:", profile, "error:", error);
    if (error || !profile) {
      console.error("[auth] Profilo non trovato per", session.user.id, error?.message);
      setProfileError(true); setLoading(false); return;
    }
    setUser({ id: session.user.id, email: session.user.email, role: profile.role });
    const [{ data: bData }, { data: eData }, { data: aptData, error: aptErr }] = await Promise.all([
      supabase.from("bookings").select("*").order("checkin"),
      supabase.from("expenses").select("*").order("date", { ascending: false }),
      supabase.from("apartments").select("*").eq("active", true).order("label"),
    ]);
    if (bData) setBookings(bData.map(dbToBooking));
    if (eData) setExpenses(eData);
    if (aptErr) {
      console.error("[apartments] Errore caricamento:", aptErr.message);
      setAptLoadError(true);
    } else {
      setAptLoadError(false);
      setApartments(aptData?.length ? [APT_ALL, ...aptData] : [APT_ALL]);
    }
    setLoading(false);
  }

  useEffect(() => {
    // Usiamo SOLO onAuthStateChange perché garantisce che il JWT sia già applicato
    // al client prima di scattare (a differenza di getSession che può precedere
    // la propagazione interna del token necessaria per le query RLS).
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      console.log("[auth] evento:", event, "user:", session?.user?.email || "none");
      if (event === "INITIAL_SESSION") {
        if (session) await handleSession(session);
        else setLoading(false);
      } else if (event === "SIGNED_IN" && session) {
        setLoading(true);
        await handleSession(session);
      } else if (event === "SIGNED_OUT") {
        setUser(null); setProfileError(false); setAptLoadError(false);
        setBookings([]); setExpenses([]); setApartments([]);
      }
    });
    return () => subscription.unsubscribe();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const expensesWithMeta = expenses.map(e => ({ ...e, paid: e.paid || false, notes: e.notes || "", rate_group: e.rate_group || null }));

  // ── Apartments ──────────────────────────────
  const addApartment = async (apt) => {
    const { data, error } = await supabase.from("apartments").insert({ id: apt.id, label: apt.label, color: apt.color, active: true }).select().single();
    if (error) { alert("Errore salvataggio appartamento: " + error.message); return; }
    if (data) setApartments(prev => [...prev, data]);
  };
  const updateApartment = async (apt) => {
    const { error } = await supabase.from("apartments").update({ label: apt.label, color: apt.color }).eq("id", apt.id);
    if (!error) setApartments(prev => prev.map(a => a.id === apt.id ? apt : a));
  };
  const deleteApartment = async (id) => {
    // Soft-delete: imposta active=false invece di eliminare, per preservare lo storico
    const { error } = await supabase.from("apartments").update({ active: false }).eq("id", id);
    if (!error) setApartments(prev => prev.filter(a => a.id !== id));
  };

  // ── Bookings ─────────────────────────────────
  const addBooking = async (formData) => {
    const row = bookingToDb(formData);
    const { data, error } = await supabase.from("bookings").insert(row).select().single();
    if (!error && data) setBookings(bs => [...bs, dbToBooking(data)]);
  };
  const updateBooking = async (id, formData) => {
    const row = bookingToDb(formData);
    const { error } = await supabase.from("bookings").update(row).eq("id", id);
    if (!error) setBookings(bs => bs.map(b => b.id === id ? { ...formData, id, price: Number(formData.price), deposit: Number(formData.deposit) || 0 } : b));
  };
  const deleteBooking = async (id) => {
    await supabase.from("bookings").delete().eq("id", id);
    setBookings(bs => bs.filter(b => b.id !== id));
  };
  const toggleCleaning = async (id) => {
    const b = bookings.find(x => x.id === id); const newVal = !b.cleaning;
    setBookings(bs => bs.map(x => x.id === id ? { ...x, cleaning: newVal } : x));
    await supabase.from("bookings").update({ cleaning: newVal }).eq("id", id);
  };
  const toggleCheckin = async (id) => {
    const b = bookings.find(x => x.id === id); const newVal = !b.checkinDone;
    setBookings(bs => bs.map(x => x.id === id ? { ...x, checkinDone: newVal } : x));
    await supabase.from("bookings").update({ checkin_done: newVal }).eq("id", id);
  };
  const toggleDeposit = async (id) => {
    const b = bookings.find(x => x.id === id); const newVal = !b.depositPaid;
    setBookings(bs => bs.map(x => x.id === id ? { ...x, depositPaid: newVal } : x));
    await supabase.from("bookings").update({ deposit_paid: newVal }).eq("id", id);
  };

  // ── Expenses ─────────────────────────────────
  const buildExpRow = (apt, date, category, notes, amount, rateGroup = null) => ({
    apt, date, category, description: category, notes: notes || "", amount: Number(amount), paid: false,
    ...(rateGroup ? { rate_group: rateGroup } : {}),
  });
  const addExpense = async (formData) => {
    const { paymentType, id: _id, ...rest } = formData;
    const year = rest.date ? rest.date.split("-")[0] : String(new Date().getFullYear());
    let rows = [];
    if (paymentType === "Rata IMU (2 rate)") {
      const rg = `imu_${Date.now()}`; const half = Math.round(Number(rest.amount) / 2 * 100) / 100;
      rows = [buildExpRow(rest.apt, `${year}-06-16`, rest.category, rest.notes, half, rg),
              buildExpRow(rest.apt, `${year}-11-30`, rest.category, rest.notes, half, rg)];
    } else if (paymentType === "Rata Condominio (5 rate)") {
      const rg = `cond_${Date.now()}`; const fifth = Math.round(Number(rest.amount) / 5 * 100) / 100;
      ["02", "04", "06", "09", "11"].forEach(m => rows.push(buildExpRow(rest.apt, `${year}-${m}-15`, rest.category, rest.notes, fifth, rg)));
    } else if (paymentType === "Mensile") {
      const rg = `mens_${Date.now()}`;
      Array.from({ length: 12 }, (_, i) => rows.push(buildExpRow(rest.apt, `${year}-${String(i + 1).padStart(2, "0")}-01`, rest.category, rest.notes, rest.amount, rg)));
    } else {
      rows = [buildExpRow(rest.apt, rest.date, rest.category, rest.notes, rest.amount)];
    }
    console.log("[addExpense] rows:", rows);
    const newExp = [];
    for (const row of rows) {
      const { data, error } = await supabase.from("expenses").insert(row).select().single();
      if (error) { console.error("[addExpense] Errore:", error); alert("Errore: " + error.message); return; }
      if (data) newExp.push(data);
    }
    setExpenses(es => [...es, ...newExp]);
  };
  const updateExpense = async (id, formData) => {
    const { paymentType, id: _id, ...rest } = formData;
    const row = { apt: rest.apt, date: rest.date, category: rest.category, description: rest.category, notes: rest.notes || "", amount: Number(rest.amount), paid: rest.paid || false };
    console.log("[updateExpense] id:", id, "row:", row);
    const { error } = await supabase.from("expenses").update(row).eq("id", id);
    if (error) { console.error("[updateExpense] Errore:", error); alert("Errore: " + error.message); return; }
    setExpenses(es => es.map(e => e.id === id ? { ...row, id } : e));
  };
  const toggleExpensePaid = async (id) => {
    const e = expenses.find(x => x.id === id); if (!e) return;
    const newVal = !(e.paid || false);
    setExpenses(es => es.map(x => x.id === id ? { ...x, paid: newVal } : x));
    await supabase.from("expenses").update({ paid: newVal }).eq("id", id);
  };
  const deleteExpense = async (id) => {
    await supabase.from("expenses").delete().eq("id", id);
    setExpenses(es => es.filter(e => e.id !== id));
  };

  const handleLogout = async () => { await supabase.auth.signOut(); };

  return {
    user, loading, profileError, aptLoadError,
    bookings, expenses: expensesWithMeta, apartments,
    handleLogout,
    addBooking, updateBooking, deleteBooking,
    toggleCleaning, toggleCheckin, toggleDeposit,
    addExpense, updateExpense, deleteExpense, toggleExpensePaid,
    addApartment, updateApartment, deleteApartment,
  };
}
