import { useState } from 'react';

export default function ImageUploader({ value = [], onChange }) {
  // editing/pinning removed per UX request

  function handleFiles(e) {
    const files = Array.from(e.target.files || []);
    const newItems = files.map((f) => ({ file: f, preview: URL.createObjectURL(f), pins: [], type: guessType(f.name) }));
    onChange([...(value || []), ...newItems]);
    e.target.value = null;
  }

  function guessType(name='') {
    const n = name.toLowerCase();
    if (n.includes('id') || n.includes('licence') || n.includes('passport')) return 'id';
    if (n.includes('paper') || n.includes('note') || n.includes('doc')) return 'document';
    if (n.includes('car') || n.includes('plate')) return 'vehicle';
    return 'unknown';
  }

  function updateItem(i, changes) {
    const next = [...value];
    next[i] = { ...next[i], ...changes };
    onChange(next);
  }

  function removeItem(i) {
    const next = [...value];
    // revoke preview url if provided
    if (next[i].preview) URL.revokeObjectURL(next[i].preview);
    next.splice(i, 1);
    onChange(next);
  }

  return (
    <div className="space-y-2">
      <input type="file" accept="image/*" multiple onChange={handleFiles} className="block"/>
      <div className="grid grid-cols-3 gap-2 mt-2">
        {(value || []).map((it, i) => (
          <div key={i} className="relative border rounded overflow-hidden">
            <img src={it.preview || it.url} alt={`photo-${i}`} className="object-cover w-full h-28"/>
            <div className="absolute top-1 right-1 flex space-x-1">
              <button type="button" onClick={() => removeItem(i)} className="bg-white px-2 py-1 rounded text-xs">Remove</button>
            </div>

            <div className="p-1 text-xs text-slate-600">
              Pins: {(it.pins || []).length}
            </div>
          </div>
        ))}
      </div>

      {/* Image editing/annotating removed */}
    </div>
  );
}