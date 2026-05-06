import { useRef, useState, useEffect } from 'react';

/*
 Simple annotator:
 - displays the image
 - clicking on it creates a pin with relative coordinates (x%, y%)
 - list of pins shown with ability to remove
 - pins are shown as absolute overlay dots
*/

export default function ImageAnnotator({ image, onChange }) {
  const containerRef = useRef();
  const [pins, setPins] = useState(image?.pins || []);

  useEffect(() => {
    setPins(image?.pins || []);
  }, [image]);

  function handleClick(e) {
    const rect = containerRef.current.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    const next = [...pins, { x: x.toFixed(2), y: y.toFixed(2), label: '' }];
    setPins(next);
    onChange({ ...image, pins: next });
  }

  function removePin(i) {
    const next = [...pins];
    next.splice(i, 1);
    setPins(next);
    onChange({ ...image, pins: next });
  }

  return (
    <div className="md:flex md:space-x-4">
      <div className="relative flex-1" style={{ minWidth: 200 }}>
        <div ref={containerRef} onClick={handleClick} className="border rounded overflow-hidden cursor-crosshair" style={{ position: 'relative' }}>
          <img src={image.preview || image.url} alt="annotation" className="w-full h-64 object-contain bg-slate-100" />
          {pins.map((p, i) => (
            <div key={i} style={{
              position: 'absolute',
              left: `${p.x}%`,
              top: `${p.y}%`,
              transform: 'translate(-50%,-50%)'
            }}>
              <div className="w-6 h-6 bg-red-500 rounded-full border-2 border-white flex items-center justify-center text-white text-xs">+</div>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-2 md:mt-0 md:w-60">
        <div className="text-sm font-medium mb-2">Pins</div>
        <ul className="space-y-2 text-sm">
          {pins.map((p, i) => (
            <li key={i} className="flex items-center justify-between">
              <span>Pin {i+1}: {p.x}%, {p.y}%</span>
              <button onClick={() => removePin(i)} className="text-xs text-red-600">Remove</button>
            </li>
          ))}
          {pins.length === 0 && <li className="text-xs text-slate-400">No pins yet — click the image to add.</li>}
        </ul>
      </div>
    </div>
  );
}