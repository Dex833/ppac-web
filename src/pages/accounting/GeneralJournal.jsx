import React, { useEffect, useState } from "react";
import { db } from "../../lib/firebase";
import {
  collection,
  query,
  orderBy,
  onSnapshot,
  doc,
  updateDoc,
  deleteDoc,
  serverTimestamp,
} from "firebase/firestore";

// Helper to get accounts for mapping accountId to code/name
function useAccounts() {
  const [accounts, setAccounts] = useState([]);
  useEffect(() => {
    const qAcc = query(collection(db, "accounts"), orderBy("code"));
    const unsub = onSnapshot(qAcc, (snap) => {
      setAccounts(
        snap.docs.map((d) => ({ id: d.id, ...d.data() }))
      );
    });
    return () => unsub();
  }, []);
  return accounts;
}

export default function GeneralJournal() {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState({ ref: "", date: "", account: "" });
  const [sortBy, setSortBy] = useState("date");
  const [sortDir, setSortDir] = useState("desc");
  const accounts = useAccounts();

  // notifications
  const [notif, setNotif] = useState({ show: false, type: "", message: "" });

  // Edit modal state (full edit incl. lines)
  const [editEntryId, setEditEntryId] = useState(null);
  const [editForm, setEditForm] = useState({
    date: "",
    description: "",
    comments: "",
    lines: [], // [{ accountId, debit, credit, memo }]
  });
  const [editError, setEditError] = useState("");

  useEffect(() => {
    setLoading(true);
    const q = query(
      collection(db, "journalEntries"),
      orderBy("createdAt", "desc")
    );
    const unsub = onSnapshot(q, (snap) => {
      setEntries(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      setLoading(false);
    });
    return () => unsub();
  }, []);

  function getAccount(accountId) {
    return accounts.find((a) => a.id === accountId);
  }
  function getAccountName(accountId) {
    const acc = getAccount(accountId);
    if (!acc) return accountId;
    return `${acc.code} - ${acc.main}${acc.individual ? " / " + acc.individual : ""}`;
  }
  function getAccountType(accountId) {
    const acc = getAccount(accountId);
    return acc ? acc.type : "";
  }

  // Sorting
  function handleSort(field) {
    if (sortBy === field) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortBy(field);
      setSortDir