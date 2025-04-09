import React, { useState } from 'react';
import { Upload } from 'lucide-react';
import { addDraw } from '../lib/api';

const FileUpload = () => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const processCSV = async (text: string) => {
    const rows = text.split('\n');
    const headers = rows[0].split(',');
    const draws = [];

    for (let i = 1; i < rows.length; i++) {
      if (!rows[i].trim()) continue;
      
      const values = rows[i].split(',');
      const draw = {
        drawNumber: parseInt(values[0], 10),
        drawDate: values[1],
        numbers: values.slice(2, 8).map(n => parseInt(n, 10)),
      };
      draws.push(draw);
    }

    for (const draw of draws) {
      await addDraw(
        draw.drawNumber,
        draw.drawDate,
        draw.numbers.slice(0, 5),
        draw.numbers[5]
      );
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setLoading(true);
    setError(null);

    try {
      const text = await file.text();
      await processCSV(text);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-white rounded-lg shadow-sm p-6">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-lg font-semibold text-gray-900">Upload Draws</h2>
        <Upload className="h-5 w-5 text-blue-600" />
      </div>

      <div className="space-y-4">
        <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center">
          <input
            type="file"
            accept=".csv"
            onChange={handleFileUpload}
            className="hidden"
            id="file-upload"
            disabled={loading}
          />
          <label
            htmlFor="file-upload"
            className="cursor-pointer text-blue-600 hover:text-blue-500"
          >
            <Upload className="h-8 w-8 mx-auto mb-2" />
            <span className="text-sm font-medium">
              {loading ? 'Uploading...' : 'Upload CSV File'}
            </span>
          </label>
          <p className="mt-1 text-xs text-gray-500">
            CSV format: DrawNumber,Date,Number1,Number2,Number3,Number4,Number5,Powerball
          </p>
        </div>

        {error && (
          <div className="text-red-600 text-sm">{error}</div>
        )}
      </div>
    </div>
  );
};

export default FileUpload;