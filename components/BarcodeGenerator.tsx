
import React from 'react';

interface BarcodeProps {
  value: string;
  className?: string;
}

export const BarcodeGenerator: React.FC<BarcodeProps> = ({ value, className }) => {
  // Simple visual representation of a barcode for UI purposes
  return (
    <div className={`flex flex-col items-center ${className}`}>
      <div className="flex space-x-[1px] h-12">
        {value.split('').map((char, i) => (
          <div 
            key={i} 
            className="bg-black" 
            style={{ width: (parseInt(char, 36) % 3 + 1) + 'px' }}
          />
        ))}
        {/* Fillers to make it look like a barcode */}
        <div className="bg-black w-[2px]"></div>
        <div className="bg-white w-[1px]"></div>
        <div className="bg-black w-[1px]"></div>
        <div className="bg-white w-[2px]"></div>
        <div className="bg-black w-[3px]"></div>
      </div>
      <span className="text-xs font-mono mt-1 tracking-widest">{value}</span>
    </div>
  );
};
