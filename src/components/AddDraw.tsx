import React, { useState } from 'react';
import { Plus } from 'lucide-react';
import { addDraw } from '../lib/api';

const AddDraw = () => {
  const [drawNumber, setDrawNumber] = useState('');
  const [drawDate, setDrawDate] = useState('');
  const [numbers, setNumbers] = useState(['', '', '', '', '', '']);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const numbersArray = numbers.map(n => parseInt(n, 10));
      await addDraw(
        parseInt(drawNumber, 10),
        drawDate,
        numbersArray.slice(0, 5),
        numbersArray[5]
      );
      
      // Reset form
      setDrawNumber('');
      setDrawDate('');
      setNumbers(['', '', '', '', '', '']);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-white rounded-lg shadow-sm p-6">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-lg font-semibold text-gray-900">Add New Draw</h2>
        <Plus className="h-5 w-5 text-blue-600" />
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700">Draw Number</label>
            <input
              type="number"
              value={drawNumber}
              onChange={(e) => setDrawNumber(e.target.value)}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Draw Date</label>
            <input
              type="date"
              value={drawDate}
              onChange={(e) => setDrawDate(e.target.value)}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
              required
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Numbers</label>
          <div className="grid grid-cols-6 gap-2">
            {numbers.map((number, index) => (
              <input
                key={index}
                type="number"
                min={1}
                max={index === 5 ? 26 : 69}
                value={number}
                onChange={(e) => {
                  const newNumbers = [...numbers];
                  newNumbers[index] = e.target.value;
                  setNumbers(newNumbers);
                }}
                className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                placeholder={index === 5 ? 'PB' : `#${index + 1}`}
                required
              />
            ))}
          </div>
        </div>

        {error && (
          <div className="text-red-600 text-sm">{error}</div>
        )}

        <button
          type="submit"
          disabled={loading}
          className="w-full py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
        >
          {loading ? 'Adding...' : 'Add Draw'}
        </button>
      </form>
    </div>
  );
};

export default AddDraw;