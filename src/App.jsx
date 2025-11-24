import React, { useEffect, useMemo, useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "./components/ui/card";
import { Button } from "./components/ui/button";
import { Input } from "./components/ui/input";
import { Textarea } from "./components/ui/textarea";
import { Label } from "./components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./components/ui/select";
import { Download, Upload, Plus, Trash, Save, Users, TreePine, Search, Printer } from "lucide-react";

/**
 * 🐀 Rat Pedigree & Litter Tracker — Full App
 * Local-first (localStorage), JSON export/import, pedigree views (ancestors + descendants), and print.
 * Baby rats are referred to as "kittens" throughout.
 * This version adds breeder prefix, keeper status, and ear type dropdown.
 */

const LS_KEY = "rat-pedigree-tracker-v1";

/**
 * @typedef {{
 *  id:string,
 *  name:string,
 *  breederPrefix?:string,
 *  keeperStatus?: 'Keeper'|'Breeder', // backwards compatible with older backups using keeperAffix
 *  keeperAffix?: string,
 *  sex:'F'|'M',
 *  color?:string,
 *  coat?:string,
 *  ear?: 'Top ear'|'Dumbo' | '',
 *  eyes?:string,
 *  dob?:string,
 *  notes?:string,
 *  sireId?:string,
 *  damId?:string,
 *  // provenance flags (optional)
 *  createdFromKitten?: boolean,
 *  sourceLitterId?: string
 * }} Rat
 */

/** @typedef {{id:string,date?:string, sireId:string, damId:string, notes?:string, kittens:Array<{id:string,name?:string,sex?:'F'|'M',color?:string,notes?:string, kept?:boolean}>}} Litter */

function uid(prefix="id") { return `${prefix}_${Math.random().toString(36).slice(2,9)}`; }

function loadState() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return { rats: [], litters: [] };
    const parsed = JSON.parse(raw);
    return { rats: parsed.rats || [], litters: parsed.litters || [] };
  } catch { return { rats: [], litters: [] }; }
}

function saveState(data) { localStorage.setItem(LS_KEY, JSON.stringify(data)); }

function fullName(r){
  if (!r) return "Unknown";
  const prefix = r.breederPrefix ? r.breederPrefix + " " : "";
  return `${prefix}${r.name || "Unnamed"}`;
}
function ownerSuffix(r){
  if (r?.keeperStatus) return r.keeperStatus === "Keeper" ? " (keeper)" : " (breeder)";
  if (r?.keeperAffix) return ` (owner: ${r.keeperAffix})`;
  return "";
}

function ExportImport({ onExport, onImport }) {
  const fileRef = useRef(null);
  return (
    <div className="flex items-center gap-2">
      <Button variant="secondary" onClick={onExport}>
        <Download className="h-4 w-4 mr-2" />
        Export
      </Button>
      <input
        ref={fileRef}
        type="file"
        accept="application/json"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onImport(f);
          e.currentTarget.value = ""; // reset
        }}
      />
      <Button variant="outline" onClick={() => fileRef.current?.click()}>
        <Upload className="h-4 w-4 mr-2" />
        Import
      </Button>
    </div>
  );
}

export default function RatTrackerApp() { // main app
  const [rats, setRats] = useState([]);
  const [litters, setLitters] = useState([]);
  const [query, setQuery] = useState("");
  const [treeFocusId, setTreeFocusId] = useState("");
  const [treeView, setTreeView] = useState("rat");
  const [treeMode, setTreeMode] = useState("anc");
  const [litterFocusId, setLitterFocusId] = useState("");
  // New controls for Rats tab filtering
  const [ratsView, setRatsView] = useState("rats");
  const [hideUnnamed, setHideUnnamed] = useState(false);

  // load once
  useEffect(() => {
    const { rats, litters } = loadState();
    setRats(rats);
    setLitters(litters);
    if (rats[0]) setTreeFocusId(rats[0].id);
    if (litters[0]) setLitterFocusId(litters[0].id);
  }, []);

  // keep a default focus up to date
  useEffect(() => {
    if (!treeFocusId && rats.length) setTreeFocusId(rats[0].id);
  }, [rats, treeFocusId]);
  useEffect(() => {
    if (!litterFocusId && litters.length) setLitterFocusId(litters[0].id);
  }, [litters, litterFocusId]);

  // persist on change
  useEffect(() => {
    saveState({ rats, litters });
  }, [rats, litters]);

  const byId = useMemo(() => Object.fromEntries(rats.map((r) => [r.id, r])), [rats]);
  const litById = useMemo(() => Object.fromEntries(litters.map((l) => [l.id, l])), [litters]);

  // Build children map for descendants
  const childrenMap = useMemo(() => {
    const m = new Map();
    for (const r of rats) {
      if (r.sireId) {
        if (!m.has(r.sireId)) m.set(r.sireId, []);
        m.get(r.sireId).push(r.id);
      }
      if (r.damId) {
        if (!m.has(r.damId)) m.set(r.damId, []);
        m.get(r.damId).push(r.id);
      }
    }
    return m; // Map<parentId, childId[]>
  }, [rats]);

  // filtered lists
  const filteredRats = useMemo(() => {
    const q = query.trim().toLowerCase();
    const base = !q
      ? rats
      : rats.filter(
          (r) =>
            [r.name, r.breederPrefix, r.keeperStatus, r.keeperAffix, r.color, r.coat, r.ear, r.eyes, r.notes].some(
              (x) => (x || "").toLowerCase().includes(q)
            ) || r.id.toLowerCase().includes(q)
        );
    return hideUnnamed ? base.filter((r) => (r.name || "").trim().toLowerCase() !== "unnamed") : base;
  }, [rats, query, hideUnnamed]);

  // Kittens flattened for display in Rats list
  const filteredKittens = useMemo(() => {
    const q = query.trim().toLowerCase();
    const flat = litters.flatMap((l) =>
      (l.kittens || []).map((k) => ({
        ...k,
        litterId: l.id,
        sire: byId[l.sireId],
        dam: byId[l.damId],
        date: l.date,
      }))
    );
    const base = !q ? flat : flat.filter((k) => [k.name, k.color, k.notes, k.sex].some((x) => (x || "").toLowerCase().includes(q)));
    return hideUnnamed ? base.filter((k) => (k.name || "").trim().toLowerCase() !== "unnamed") : base;
  }, [litters, byId, query, hideUnnamed]);

  function addOrUpdateRat(r) {
    setRats((prev) => {
      const i = prev.findIndex((x) => x.id === r.id);
      if (i === -1) return [...prev, r];
      const next = [...prev];
      next[i] = r;
      return next;
    });
  }

  function deleteRat(id) {
    // Also clear references in litters and children
    setLitters((prev) =>
      prev.map((l) => ({
        ...l,
        sireId: l.sireId === id ? "" : l.sireId,
        damId: l.damId === id ? "" : l.damId,
        kittens: l.kittens.map((k) => ({ ...k })),
      }))
    );
    setRats((prev) =>
      prev
        .filter((r) => r.id !== id)
        .map((r) => ({
          ...r,
          sireId: r.sireId === id ? undefined : r.sireId,
          damId: r.damId === id ? undefined : r.damId,
        }))
    );
  }

  function addOrUpdateLitter(l) {
    setLitters((prev) => {
      const i = prev.findIndex((x) => x.id === l.id);
      if (i === -1) return [...prev, l];
      const next = [...prev];
      next[i] = l;
      return next;
    });
  }

  function deleteLitter(id) {
    setLitters((prev) => prev.filter((l) => l.id !== id));
  }

  function exportData() {
    const blob = new Blob([JSON.stringify({ rats, litters }, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `rat-tracker-backup-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  function importData(file) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result || "{}"));
        setRats(parsed.rats || []);
        setLitters(parsed.litters || []);
        if ((parsed.rats || [])[0]) setTreeFocusId(parsed.rats[0].id);
        if ((parsed.litters || [])[0]) setLitterFocusId(parsed.litters[0].id);
      } catch (e) {
        alert("Failed to import JSON");
      }
    };
    reader.readAsText(file);
  }

  function printPedigree(ratId) {
    const rat = byId[ratId];
    if (!rat) {
      alert("Pick a rat first");
      return;
    }
    // Build 4-gen ancestor layers (reuse logic from AncestorTree)
    const map = byId;
    const layers = [];
    let curr = [ratId];
    for (let d = 0; d < 4; d++) {
      layers.push(curr);
      const next = [];
      for (const id of curr) {
        const r = map[id];
        if (r) {
          if (r.sireId) next.push(r.sireId);
          if (r.damId) next.push(r.damId);
        }
      }
      if (next.length === 0) break;
      curr = Array.from(new Set(next));
    }

    const w = window.open("", "_blank");
    if (!w) return;
    const css = `
      body{ font-family: ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Arial; padding:24px; }
      h1{ font-size:20px; margin:0 0 12px; }
      .grid{ display:grid; grid-template-columns: repeat(${layers.length}, 1fr); gap:12px; }
      .card{ border:1px solid #e5e7eb; border-radius:12px; padding:8px 10px; }
      .muted{ color:#6b7280; font-size:12px; }
      header{ display:flex; justify-content:space-between; align-items:center; margin-bottom:12px; }
    `;
    const fmt = (id) => {
      const r = map[id];
      if (!r) return `<div class="card"><div>Unknown</div><div class="muted">${id}</div></div>`;
      return `<div class="card"><div><strong>${fullName(r) || "Unnamed"}</strong></div><div class="muted">${
        r.sex || ""
      }${r.color ? ` — ${r.color}` : ""}${r.ear ? ` — ${r.ear} ears` : ""}${r.dob ? ` — DOB: ${r.dob}` : ""}${
        r.keeperStatus ? ` — status: ${r.keeperStatus}` : ""
      }${!r.keeperStatus && r.keeperAffix ? ` — owner: ${r.keeperAffix}` : ""}</div></div>`;
    };
    w.document.write(`<!doctype html><html><head><meta charset="utf-8"/><title>Pedigree: ${
      fullName(rat) || rat.id
    }</title><style>${css}</style></head><body>
      <header><h1>Pedigree — ${fullName(rat) || rat.id}</h1><div class="muted">Generated ${new Date().toLocaleString()}</div></header>
      <div class="grid">${layers
        .map((col) => col.map(fmt).join(""))
        .join("")}</div>
      <script>window.print();</script>
    </body></html>`);
    w.document.close();
  }

  return (
    <div className="min-h-screen bg-gray-50 p-4 sm:p-6">
      <div className="max-w-7xl mx-auto space-y-4">
        <header className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">🐀 Rat Pedigree & Litter Tracker</h1>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 opacity-60" />
              <Input className="pl-8 w-60" placeholder="Search rats…" value={query} onChange={(e) => setQuery(e.target.value)} />
            </div>
            <ExportImport onExport={exportData} onImport={importData} />
          </div>
        </header>

        <Tabs defaultValue="rats" className="w-full">
          <TabsList>
            <TabsTrigger value="rats">
              <Users className="h-4 w-4 mr-2" />
              Rats
            </TabsTrigger>
            <TabsTrigger value="litters">
              <Plus className="h-4 w-4 mr-2" />
              Litters
            </TabsTrigger>
            <TabsTrigger value="tree">
              <TreePine className="h-4 w-4 mr-2" />
              Family Tree
            </TabsTrigger>
          </TabsList>

          <TabsContent value="rats">
            <div className="grid md:grid-cols-2 gap-4">
              <Card>
                <CardHeader>
                  <CardTitle>Add / Edit Rat</CardTitle>
                </CardHeader>
                <CardContent>
                  <RatForm rats={rats} onSave={addOrUpdateRat} />
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between gap-3">
                    <CardTitle>
                      All Rats ({filteredRats.length}
                      {ratsView === "all" ? ` + ${filteredKittens.length} kittens` : ""})
                    </CardTitle>
                    <div className="flex items-center gap-3">
                      <div className="flex items-center gap-2 text-xs">
                        <span>Show:</span>
                        <Select value={ratsView} onValueChange={(v) => setRatsView(v)}>
                          <SelectTrigger className="h-7 w-40">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="rats">Rats only</SelectItem>
                            <SelectItem value="kittens">Kittens only</SelectItem>
                            <SelectItem value="all">All</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <label className="text-xs flex items-center gap-2">
                        <input type="checkbox" checked={hideUnnamed} onChange={(e) => setHideUnnamed(e.target.checked)} />
                        Hide "Unnamed"
                      </label>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  {(ratsView === "rats" || ratsView === "all") && (
                    <RatList
                      rats={filteredRats}
                      onSelect={(id) => {
                        setTreeFocusId(id);
                        setTreeView("rat");
                      }}
                      onDelete={deleteRat}
                    />
                  )}
                  {(ratsView === "kittens" || ratsView === "all") && (
                    <div className="mt-4">
                      <div className="text-sm font-medium mb-2">Kittens (not yet kept) — {filteredKittens.length}</div>
                      <KittenList
                        kittens={filteredKittens}
                        onAdopt={(k) => {
                          const newRat = {
                            id: uid("rat"),
                            name: k.name || "Unnamed",
                            sex: k.sex || "F",
                            color: k.color,
                            notes: k.notes,
                            sireId: k.sire?.id,
                            damId: k.dam?.id,
                            createdFromKitten: true,
                            sourceLitterId: k.litterId,
                            dob: k.date || "",
                          };
                          addOrUpdateRat(newRat);
                          setTreeFocusId(newRat.id);
                          setTreeView("rat");
                        }}
                      />
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="litters">
            <div className="grid md:grid-cols-2 gap-4">
              <Card>
                <CardHeader>
                  <CardTitle>Add / Edit Litter</CardTitle>
                </CardHeader>
                <CardContent>
                  <LitterForm rats={rats} onSave={addOrUpdateLitter} />
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle>All Litters ({litters.length})</CardTitle>
                </CardHeader>
                <CardContent>
                  <LitterList
                    litters={litters}
                    byId={byId}
                    onDelete={deleteLitter}
                    onAdoptToRats={(kitten, sireId, damId) => {
                      const newRat = {
                        id: uid("rat"),
                        name: kitten.name || "Unnamed",
                        sex: kitten.sex || "F",
                        color: kitten.color,
                        notes: kitten.notes,
                        sireId,
                        damId,
                        createdFromKitten: true,
                      };
                      addOrUpdateRat(newRat);
                      setTreeFocusId(newRat.id);
                      setTreeView("rat");
                    }}
                  />
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="tree">
            <Card>
              <CardHeader>
                <CardTitle>Family Tree</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid md:grid-cols-3 gap-3 items-end">
                  <div className="space-y-2">
                    <Label className="text-sm">View</Label>
                    <Select value={treeView} onValueChange={(v) => setTreeView(v)}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="rat">By Rat</SelectItem>
                        <SelectItem value="litter">By Litter</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {treeView === "rat" ? (
                    <div className="space-y-2">
                      <Label className="text-sm">Focus rat</Label>
                      <RatPicker rats={rats} value={treeFocusId} onChange={setTreeFocusId} />
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <Label className="text-sm">Focus litter</Label>
                      <LitterPicker litters={litters} byId={byId} value={litterFocusId} onChange={setLitterFocusId} />
                    </div>
                  )}

                  {treeView === "rat" ? (
                    <div className="space-y-2">
                      <Label className="text-sm">Mode</Label>
                      <Select value={treeMode} onValueChange={(v) => setTreeMode(v)}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="anc">Ancestors</SelectItem>
                          <SelectItem value="desc">Descendants</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  ) : (
                    <div />
                  )}
                </div>

                <div className="mt-4 flex items-center justify-between">
                  <div className="text-sm opacity-70">
                    {treeView === "rat" && treeFocusId
                      ? treeMode === "anc"
                        ? "Showing ancestors"
                        : "Showing descendants"
                      : treeView === "litter"
                      ? "Litter overview"
                      : "Select a rat"}
                  </div>
                  {treeView === "rat" && treeFocusId && (
                    <Button size="sm" variant="outline" onClick={() => printPedigree(treeFocusId)} title="Print pedigree">
                      <Printer className="h-4 w-4 mr-2" />
                      Print pedigree
                    </Button>
                  )}
                </div>

                <div className="mt-4">
                  {treeView === "rat" ? (
                    treeFocusId ? (
                      treeMode === "anc" ? (
                        <AncestorTree rootId={treeFocusId} rats={rats} maxDepth={4} />
                      ) : (
                        <DescendantTree rootId={treeFocusId} rats={rats} childrenMap={childrenMap} maxDepth={4} />
                      )
                    ) : (
                      <EmptyTreeHint rats={rats} />
                    )
                  ) : litterFocusId ? (
                    <LitterOverview
                      litter={litById[litterFocusId]}
                      rats={rats}
                      onViewRat={(id) => {
                        setTreeFocusId(id);
                        setTreeView("rat");
                      }}
                    />
                  ) : (
                    <p className="text-sm opacity-70">Add a litter to view parents and kittens here.</p>
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        <footer className="text-xs text-center opacity-70 pt-6 pb-2">
          Data saves automatically to your browser. Export regularly for backups.
        </footer>
      </div>
    </div>
  );
}

function EmptyTreeHint({ rats }) {
  if (!rats.length) return <p className="text-sm opacity-70">No rats yet — add a rat first, or import from a backup.</p>;
  return <p className="text-sm opacity-70">Pick a rat to render their ancestors or descendants.</p>;
}

function RatForm({ rats, onSave }) {
  const empty = {
    id: uid("rat"),
    name: "",
    breederPrefix: "",
    keeperStatus: "Keeper",
    keeperAffix: "",
    sex: "F",
    color: "",
    coat: "",
    ear: "",
    eyes: "",
    dob: "",
    notes: "",
    sireId: undefined,
    damId: undefined,
  };
  const [model, setModel] = useState(empty);

  function submit(e) {
    e.preventDefault();
    if (!model.name) {
      alert("Name is required");
      return;
    }
    onSave(model);
    setModel({ ...empty, id: uid("rat") });
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label>Breeder prefix (rattery/stud)</Label>
          <Input
            value={model.breederPrefix || ""}
            onChange={(e) => setModel((m) => ({ ...m, breederPrefix: e.target.value }))}
            placeholder="e.g. Sunfire"
          />
        </div>
        <div>
          <Label>Name</Label>
          <Input value={model.name} onChange={(e) => setModel((m) => ({ ...m, name: e.target.value }))} placeholder="e.g. Rega" />
        </div>
        <div>
          <Label>Keeper status</Label>
          <Select value={model.keeperStatus || "Keeper"} onValueChange={(v) => setModel((m) => ({ ...m, keeperStatus: v }))}>
            <SelectTrigger>
              <SelectValue placeholder="Select status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="Keeper">Keeper</SelectItem>
              <SelectItem value="Breeder">Breeder</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Sex</Label>
          <Select value={model.sex} onValueChange={(v) => setModel((m) => ({ ...m, sex: v }))}>
            <SelectTrigger>
              <SelectValue placeholder="Sex" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="F">Female</SelectItem>
              <SelectItem value="M">Male</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Color/Variety</Label>
          <Input
            value={model.color}
            onChange={(e) => setModel((m) => ({ ...m, color: e.target.value }))}
            placeholder="e.g. Silver fawn"
          />
        </div>
        <div>
          <Label>Coat</Label>
          <Input
            value={model.coat}
            onChange={(e) => setModel((m) => ({ ...m, coat: e.target.value }))}
            placeholder="e.g. Standard"
          />
        </div>
        <div>
          <Label>Ear type</Label>
          <Select value={model.ear || ""} onValueChange={(v) => setModel((m) => ({ ...m, ear: v }))}>
            <SelectTrigger>
              <SelectValue placeholder="Select ear type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="Top ear">Top ear</SelectItem>
              <SelectItem value="Dumbo">Dumbo</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Eye color</Label>
          <Input
            value={model.eyes}
            onChange={(e) => setModel((m) => ({ ...m, eyes: e.target.value }))}
            placeholder="e.g. Pink"
          />
        </div>
        <div>
          <Label>Date of birth</Label>
          <Input type="date" value={model.dob} onChange={(e) => setModel((m) => ({ ...m, dob: e.target.value }))} />
        </div>
        <div>
          <Label>Sire (father)</Label>
          <RatPicker
            rats={rats.filter((r) => r.sex === "M")}
            value={model.sireId || ""}
            onChange={(id) => setModel((m) => ({ ...m, sireId: id || undefined }))}
          />
        </div>
        <div>
          <Label>Dam (mother)</Label>
          <RatPicker
            rats={rats.filter((r) => r.sex === "F")}
            value={model.damId || ""}
            onChange={(id) => setModel((m) => ({ ...m, damId: id || undefined }))}
          />
        </div>
      </div>
      <div>
        <Label>Notes</Label>
        <Textarea
          value={model.notes}
          onChange={(e) => setModel((m) => ({ ...m, notes: e.target.value }))}
          placeholder="temperament, health, show results…"
        />
      </div>
      <div className="flex gap-2">
        <Button type="submit">
          <Save className="h-4 w-4 mr-2" />
          Save Rat
        </Button>
        <Button type="button" variant="outline" onClick={() => setModel({ ...empty, id: uid("rat") })}>
          Clear
        </Button>
      </div>
    </form>
  );
}

function RatList({ rats, onSelect, onDelete }) {
  if (!rats.length) return <p className="text-sm opacity-70">No rats yet — add one on the left.</p>;
  return (
    <div className="space-y-2 max-h-[540px] overflow-auto pr-1">
      {rats.map((r) => (
        <div key={r.id} className="border rounded-2xl p-3 flex items-start justify-between">
          <div>
            <div className="font-medium">
              {fullName(r)} <span className="text-xs opacity-60">({r.sex})</span>
            </div>
            <div className="text-xs opacity-75">
              {r.color || "—"}
              {r.coat ? `, ${r.coat}` : ""}
              {r.ear ? `, ${r.ear} ears` : ""}
              {r.eyes ? `, ${r.eyes}` : ""}
            </div>
            {r.dob && <div className="text-xs opacity-75">DOB: {r.dob}</div>}
            {r.keeperStatus && <div className="text-xs opacity-75">Keeper status: {r.keeperStatus}</div>}
            {!r.keeperStatus && r.keeperAffix && <div className="text-xs opacity-75">Owner affix: {r.keeperAffix}</div>}
            <div className="text-xs opacity-75">
              Parents:{" "}
              {r.sireId ? fullName(rats.find((x) => x.id === r.sireId) || null) || r.sireId : "?"} ×{" "}
              {r.damId ? fullName(rats.find((x) => x.id === r.damId) || null) || r.damId : "?"}
            </div>
            {r.notes && <div className="text-xs mt-1 whitespace-pre-wrap">{r.notes}</div>}
            <div className="pt-2">
              <Button variant="secondary" size="sm" onClick={() => onSelect(r.id)}>
                Show in tree
              </Button>
            </div>
          </div>
          <Button variant="ghost" size="icon" onClick={() => onDelete(r.id)} title="Delete">
            <Trash className="h-4 w-4" />
          </Button>
        </div>
      ))}
    </div>
  );
}

function KittenList({ kittens, onAdopt }) {
  if (!kittens.length) return <p className="text-sm opacity-70">No kittens to show.</p>;
  return (
    <div className="space-y-2">
      {kittens.map((k) => (
        <div key={k.id} className="border rounded-xl px-3 py-2 flex items-start justify-between bg-white">
          <div className="text-sm">
            <div className="font-medium">
              {k.name || "Unnamed"} <span className="opacity-60">({k.sex})</span>{" "}
              {k.color ? <span className="opacity-80 text-xs">— {k.color}</span> : null}
            </div>
            <div className="text-xs opacity-70">
              Parents:{" "}
              {k.sire ? (k.sire.breederPrefix ? k.sire.breederPrefix + " " : "") + k.sire.name : "Unknown"} ×{" "}
              {k.dam ? (k.dam.breederPrefix ? k.dam.breederPrefix + " " : "") + k.dam.name : "Unknown"}{" "}
              {k.date ? `— litter: ${k.date}` : ""}
            </div>
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="secondary" onClick={() => onAdopt && onAdopt(k)}>
              Keep as rat
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
}

function RatPicker({ rats, value, onChange }) {
  const safeValue = value ?? "";
  return (
    <Select value={safeValue} onValueChange={(v) => onChange(v === "__none__" ? "" : v)}>
      <SelectTrigger>
        <SelectValue placeholder="Select…" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="__none__">— None —</SelectItem>
        {rats.map((r) => (
          <SelectItem key={r.id} value={r.id}>
            {fullName(r)} ({r.sex})
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function LitterPicker({ litters, byId, value, onChange }) {
  return (
    <Select value={value || ""} onValueChange={onChange}>
      <SelectTrigger>
        <SelectValue placeholder="Select a litter…" />
      </SelectTrigger>
      <SelectContent>
        {litters.length === 0 && (
          <SelectItem value="" disabled>
            No litters
          </SelectItem>
        )}
        {litters.map((l) => (
          <SelectItem key={l.id} value={l.id}>
            {l.date || "Undated"} — {byId[l.sireId] ? fullName(byId[l.sireId]) : "Unknown"} ×{" "}
            {byId[l.damId] ? fullName(byId[l.damId]) : "Unknown"}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function LitterForm({ rats, onSave }) {
  const [model, setModel] = useState({ id: uid("litter"), date: "", sireId: "", damId: "", notes: "", kittens: [] });
  const [kittenDraft, setKittenDraft] = useState({ name: "", sex: "F", color: "", notes: "" });

  function addKitten() {
    setModel((m) => ({
      ...m,
      kittens: [
        ...m.kittens,
        {
          id: uid("kitten"),
          name: kittenDraft.name || undefined,
          sex: kittenDraft.sex,
          color: kittenDraft.color || undefined,
          notes: kittenDraft.notes || undefined,
        },
      ],
    }));
    setKittenDraft({ name: "", sex: "F", color: "", notes: "" });
  }

  function submit(e) {
    e.preventDefault();
    if (!model.sireId || !model.damId) {
      alert("Select both sire and dam");
      return;
    }
    onSave(model);
    setModel({ id: uid("litter"), date: "", sireId: "", damId: "", notes: "", kittens: [] });
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label>Date</Label>
          <Input type="date" value={model.date} onChange={(e) => setModel((m) => ({ ...m, date: e.target.value }))} />
        </div>
        <div />
        <div>
          <Label>Sire</Label>
          <RatPicker rats={rats.filter((r) => r.sex === "M")} value={model.sireId} onChange={(id) => setModel((m) => ({ ...m, sireId: id }))} />
        </div>
        <div>
          <Label>Dam</Label>
          <RatPicker rats={rats.filter((r) => r.sex === "F")} value={model.damId} onChange={(id) => setModel((m) => ({ ...m, damId: id }))} />
        </div>
      </div>
      <div>
        <Label>Notes</Label>
        <Textarea
          value={model.notes}
          onChange={(e) => setModel((m) => ({ ...m, notes: e.target.value }))}
          placeholder="size of litter, observations…"
        />
      </div>

      <div className="border rounded-2xl p-3">
        <div className="font-medium mb-2">Add Kitten</div>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-2 items-end">
          <div>
            <Label>Name</Label>
            <Input
              value={kittenDraft.name}
              onChange={(e) => setKittenDraft((p) => ({ ...p, name: e.target.value }))}
              placeholder="optional"
            />
          </div>
          <div>
            <Label>Sex</Label>
            <Select value={kittenDraft.sex} onValueChange={(v) => setKittenDraft((p) => ({ ...p, sex: v }))}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="F">Female</SelectItem>
                <SelectItem value="M">Male</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Color</Label>
            <Input
              value={kittenDraft.color}
              onChange={(e) => setKittenDraft((p) => ({ ...p, color: e.target.value }))}
              placeholder="e.g. silver fawn"
            />
          </div>
          <div className="md:col-span-2">
            <Label>Notes</Label>
            <Input
              value={kittenDraft.notes}
              onChange={(e) => setKittenDraft((p) => ({ ...p, notes: e.target.value }))}
              placeholder="optional"
            />
          </div>
          <div className="col-span-full">
            <Button type="button" variant="secondary" onClick={addKitten}>
              <Plus className="h-4 w-4 mr-2" />
              Add Kitten to Litter
            </Button>
          </div>
        </div>
        {model.kittens.length > 0 && (
          <div className="mt-3 text-sm">
            <div className="font-medium mb-1">Kittens in this litter ({model.kittens.length})</div>
            <div className="space-y-1">
              {model.kittens.map((k) => (
                <div key={k.id} className="flex items-center justify-between border rounded-xl px-3 py-2">
                  <div>
                    {k.name || "Unnamed"} <span className="opacity-60 text-xs">({k.sex})</span>{" "}
                    <span className="opacity-80 text-xs">{k.color || ""}</span>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setModel((m) => ({ ...m, kittens: m.kittens.filter((x) => x.id !== k.id) }))}
                  >
                    <Trash className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
      <div className="flex gap-2">
        <Button type="submit">
          <Save className="h-4 w-4 mr-2" />
          Save Litter
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => setModel({ id: uid("litter"), date: "", sireId: "", damId: "", notes: "", kittens: [] })}
        >
          Clear
        </Button>
      </div>
    </form>
  );
}

function LitterOverview({ litter, rats, onViewRat }) {
  const sire = rats.find((r) => r.id === litter?.sireId);
  const dam = rats.find((r) => r.id === litter?.damId);
  if (!litter) return null;
  return (
    <div className="space-y-4">
      <div className="grid md:grid-cols-3 gap-3">
        <AncestorCard rat={sire} fallbackId={litter.sireId} highlight />
        <div className="rounded-2xl border p-3 bg-white">
          <div className="font-medium">Litter — {litter.date || "Undated"}</div>
          <div className="text-xs opacity-70">Kittens: {litter.kittens.length}</div>
        </div>
        <AncestorCard rat={dam} fallbackId={litter.damId} highlight />
      </div>
      {litter.kittens.length > 0 && (
        <div className="grid md:grid-cols-2 gap-2">
          {litter.kittens.map((k) => (
            <div key={k.id} className="border rounded-xl px-3 py-2 flex items-center justify-between bg-white">
              <div className="text-sm">
                {k.name || "Unnamed"} <span className="opacity-60">({k.sex})</span>{" "}
                {k.color ? <span className="opacity-80 text-xs">— {k.color}</span> : null}
              </div>
              <Button size="sm" variant="secondary" onClick={() => onViewRat && onViewRat(k.id)} disabled>
                View kitten tree
              </Button>
            </div>
          ))}
        </div>
      )}
      <div className="text-xs opacity-70">
        Tip: Click a kitten&apos;s “Keep as rat” in the Litters tab to promote it to the Rats list.
      </div>
    </div>
  );
}

function LitterList({ litters, byId, onDelete, onAdoptToRats }) {
  if (!litters.length) return <p className="text-sm opacity-70">No litters yet — add one on the left.</p>;
  return (
    <div className="space-y-3 max-h-[540px] overflow-auto pr-1">
      {litters.map((l) => (
        <div key={l.id} className="border rounded-2xl p-3">
          <div className="flex items-start justify-between">
            <div>
              <div className="font-medium">
                {l.date || "Undated"} — {byId[l.sireId] ? fullName(byId[l.sireId]) : "Unknown"} ×{" "}
                {byId[l.damId] ? fullName(byId[l.damId]) : "Unknown"}
              </div>
              {l.notes && <div className="text-xs mt-1 whitespace-pre-wrap opacity-80">{l.notes}</div>}
            </div>
            <Button variant="ghost" size="icon" onClick={() => onDelete(l.id)} title="Delete">
              <Trash className="h-4 w-4" />
            </Button>
          </div>
          {l.kittens.length > 0 && (
            <div className="mt-2">
              <div className="text-sm font-medium mb-1">Kittens ({l.kittens.length})</div>
              <div className="grid md:grid-cols-2 gap-2">
                {l.kittens.map((k) => (
                  <div key={k.id} className="border rounded-xl px-3 py-2 flex items-center justify-between">
                    <div className="text-sm">
                      {k.name || "Unnamed"} <span className="opacity-60">({k.sex})</span>{" "}
                      {k.color ? <span className="opacity-80 text-xs">— {k.color}</span> : null}
                    </div>
                    <div className="flex gap-2">
                      <Button size="sm" variant="secondary" onClick={() => onAdoptToRats(k, l.sireId, l.damId)}>
                        Keep as rat
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

/** Ancestor tree (up to N generations) rendered as columns */
function AncestorTree({ rootId, rats, maxDepth = 4 }) {
  const map = useMemo(() => Object.fromEntries(rats.map((r) => [r.id, r])), [rats]);
  const layers = useMemo(() => {
    /** @type {string[][]} */
    const cols = [];
    let curr = [rootId];
    for (let d = 0; d < maxDepth; d++) {
      cols.push(curr);
      const next = [];
      for (const id of curr) {
        const r = map[id];
        if (r) {
          if (r.sireId) next.push(r.sireId);
          if (r.damId) next.push(r.damId);
        }
      }
      if (next.length === 0) break;
      curr = Array.from(new Set(next));
    }
    return cols;
  }, [rootId, rats, maxDepth, map]);

  return (
    <div className="overflow-x-auto">
      <div className="grid" style={{ gridTemplateColumns: `repeat(${layers.length}, minmax(220px, 1fr))`, gap: "16px" }}>
        {layers.map((col, i) => (
          <div key={i} className="space-y-3">
            <div className="text-xs uppercase tracking-wide opacity-60">{i === 0 ? "Focus" : `Gen +${i}`}</div>
            {col.map((id) => (
              <AncestorCard key={id} rat={map[id]} fallbackId={id} highlight={i === 0} />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

/** Descendant tree (up to N generations) rendered as columns */
function DescendantTree({ rootId, rats, childrenMap, maxDepth = 4 }) {
  const map = useMemo(() => Object.fromEntries(rats.map((r) => [r.id, r])), [rats]);
  const layers = useMemo(() => {
    /** @type {string[][]} */
    const cols = [];
    let curr = [rootId];
    for (let d = 0; d < maxDepth; d++) {
      cols.push(curr);
      const next = [];
      for (const id of curr) {
        const kids = childrenMap.get(id) || [];
        next.push(...kids);
      }
      if (next.length === 0) break;
      curr = Array.from(new Set(next));
    }
    return cols;
  }, [rootId, childrenMap, maxDepth]);

  return (
    <div className="overflow-x-auto">
      <div className="grid" style={{ gridTemplateColumns: `repeat(${layers.length}, minmax(220px, 1fr))`, gap: "16px" }}>
        {layers.map((col, i) => (
          <div key={i} className="space-y-3">
            <div className="text-xs uppercase tracking-wide opacity-60">{i === 0 ? "Focus" : `Gen -${i}`}</div>
            {col.map((id) => (
              <AncestorCard key={id} rat={map[id]} fallbackId={id} highlight={i === 0} />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

function AncestorCard({ rat, fallbackId, highlight }) {
  return (
    <div className={`rounded-2xl border ${highlight ? "border-purple-300 bg-purple-50" : "border-gray-200 bg-white"} p-3`}>
      <div className="font-medium">{rat ? fullName(rat) : "Unknown"}</div>
      <div className="text-xs opacity-70">
        {rat ? `${rat.sex} — ${rat.color || "variety ?"}${rat.ear ? `, ${rat.ear} ears` : ""}${ownerSuffix(rat)}` : fallbackId}
      </div>
      {rat?.dob && <div className="text-xs opacity-70">DOB: {rat.dob}</div>}
      {rat?.notes && <div className="text-xs mt-1 whitespace-pre-wrap">{rat.notes}</div>}
    </div>
  );
}
