import React, { useState } from 'react';
import { List, Plus, Trash2, Info, PlusCircle } from 'lucide-react';
import { showToast } from './Toast';
import { addDraw } from '../lib/api';
import NumberBall from './NumberBall';
import LoadingSpinner from './LoadingSpinner';

interface Combination {
  id: string;
  whiteBalls: string[];
  powerball: string;
}

interface DrawEntry {
  id: string;
  drawNumber: string;
  drawDate: string;
  combinations: Combination[];
}

const BatchAddDraw = () => {
  const [entries, setEntries] = useState<DrawEntry[]>([
    {
      id: Date.now().toString(),
      drawNumber: '',
      drawDate: '',
      combinations: [
        {
          id: `${Date.now()}-0`,
          whiteBalls: ['', '', '', '', ''],
          powerball: '',
        }
      ],
    },
  ]);
  const [loading, setLoading] = useState(false);

  const addEntry = () => {
    setEntries([
      ...entries,
      {
        id: Date.now().toString(),
        drawNumber: '',
        drawDate: '',
        combinations: [
          {
            id: `${Date.now()}-0`,
            whiteBalls: ['', '', '', '', ''],
            powerball: '',
          }
        ],
      },
    ]);
  };

  const removeEntry = (id: string) => {
    if (entries.length > 1) {
      setEntries(entries.filter(entry => entry.id !== id));
    } else {
      showToast.error('You must have at least one entry');
    }
  };

  const updateEntry = (id: string, field: string, value: string) => {
    setEntries(
      entries.map(entry => {
        if (entry.id === id) {
          return { ...entry, [field]: value };
        }
        return entry;
      })
    );
  };

  const addCombination = (entryId: string) => {
    setEntries(
      entries.map(entry => {
        if (entry.id === entryId) {
          return {
            ...entry,
            combinations: [
              ...entry.combinations,
              {
                id: `${Date.now()}-${entry.combinations.length}`,
                whiteBalls: ['', '', '', '', ''],
                powerball: '',
              }
            ]
          };
        }
        return entry;
      })
    );
  };

  const removeCombination = (entryId: string, combinationId: string) => {
    setEntries(
      entries.map(entry => {
        if (entry.id === entryId) {
          if (entry.combinations.length > 1) {
            return {
              ...entry,
              combinations: entry.combinations.filter(combo => combo.id !== combinationId)
            };
          }
          // Don't remove if it's the only combination
          showToast.error('Each draw must have at least one combination');
        }
        return entry;
      })
    );
  };

  const updateWhiteBall = (entryId: string, combinationId: string, index: number, value: string) => {
    setEntries(
      entries.map(entry => {
        if (entry.id === entryId) {
          return {
            ...entry,
            combinations: entry.combinations.map(combo => {
              if (combo.id === combinationId) {
                const newWhiteBalls = [...combo.whiteBalls];
                newWhiteBalls[index] = value;
                return { ...combo, whiteBalls: newWhiteBalls };
              }
              return combo;
            })
          };
        }
        return entry;
      })
    );
  };

  const updatePowerball = (entryId: string, combinationId: string, value: string) => {
    setEntries(
      entries.map(entry => {
        if (entry.id === entryId) {
          return {
            ...entry,
            combinations: entry.combinations.map(combo => {
              if (combo.id === combinationId) {
                return { ...combo, powerball: value };
              }
              return combo;
            })
          };
        }
        return entry;
      })
    );
  };

  const validateEntries = (): boolean => {
    for (const entry of entries) {
      if (!entry.drawNumber || !entry.drawDate) {
        showToast.error('Draw number and date are required for all entries');
        return false;
      }

      for (const combo of entry.combinations) {
        if (combo.whiteBalls.some(ball => !ball)) {
          showToast.error('All white balls must be specified');
          return false;
        }

        if (!combo.powerball) {
          showToast.error('Powerball is required for all combinations');
          return false;
        }

        // Validate number ranges
        const whiteBallsNum = combo.whiteBalls.map(ball => parseInt(ball, 10));
        const powerballNum = parseInt(combo.powerball, 10);

        if (whiteBallsNum.some(ball => ball < 1 || ball > 69)) {
          showToast.error('White balls must be between 1 and 69');
          return false;
        }

        if (powerballNum < 1 || powerballNum > 26) {
          showToast.error('Powerball must be between 1 and 26');
          return false;
        }

        // Check for duplicates in white balls
        const uniqueWhiteBalls = new Set(whiteBallsNum);
        if (uniqueWhiteBalls.size !== 5) {
          showToast.error('White balls must be unique');
          return false;
        }
      }
    }

    return true;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!validateEntries()) {
      return;
    }
    
    setLoading(true);
    
    try {
      // Process entries one by one
      for (const entry of entries) {
        for (const combo of entry.combinations) {
          await addDraw(
            parseInt(entry.drawNumber, 10),
            entry.drawDate,
            combo.whiteBalls.map(ball => parseInt(ball, 10)),
            parseInt(combo.powerball, 10)
          );
        }
      }
      
      const totalCombinations = entries.reduce((total, entry) => total + entry.combinations.length, 0);
      showToast.success(`Successfully added ${totalCombinations} combinations for ${entries.length} draw${entries.length > 1 ? 's' : ''}`);
      
      // Reset form with a single empty entry
      setEntries([
        {
          id: Date.now().toString(),
          drawNumber: '',
          drawDate: '',
          combinations: [
            {
              id: `${Date.now()}-0`,
              whiteBalls: ['', '', '', '', ''],
              powerball: '',
            }
          ],
        },
      ]);
    } catch (err) {
      showToast.error(err instanceof Error ? err.message : 'Failed to add draws');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-white rounded-lg shadow-sm p-6">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center space-x-3">
          <List className="h-6 w-6 text-blue-600" />
          <h2 className="text-lg font-semibold text-gray-900">Batch Add Draws</h2>
        </div>
        <button
          type="button"
          onClick={addEntry}
          className="flex items-center space-x-1 px-3 py-1 bg-blue-100 text-blue-700 rounded-md hover:bg-blue-200"
        >
          <Plus className="h-4 w-4" />
          <span>Add Draw</span>
        </button>
      </div>

      <div className="info-box bg-blue-50 p-4 rounded-md mb-4 flex items-start space-x-3">
        <Info className="h-5 w-5 text-blue-600 mt-0.5" />
        <div className="text-sm text-blue-800">
          <p>Add multiple Powerball draws at once. Each draw can have multiple combinations.</p>
          <p>White balls should be in the range 1-69 and Powerball in the range 1-26.</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {entries.map((entry, entryIndex) => (
          <div key={entry.id} className="bg-gray-50 p-4 rounded-lg relative">
            {entries.length > 1 && (
              <button
                type="button"
                onClick={() => removeEntry(entry.id)}
                className="absolute top-2 right-2 text-red-500 hover:text-red-700"
                title="Remove draw"
              >
                <Trash2 className="h-5 w-5" />
              </button>
            )}
            
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">Draw Number</label>
                <input
                  type="number"
                  min="1"
                  value={entry.drawNumber}
                  onChange={(e) => updateEntry(entry.id, 'drawNumber', e.target.value)}
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                  placeholder="e.g. 1234"
                  required
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700">Draw Date</label>
                <input
                  type="date"
                  value={entry.drawDate}
                  onChange={(e) => updateEntry(entry.id, 'drawDate', e.target.value)}
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                  required
                />
              </div>
            </div>
            
            <div className="mb-2 flex justify-between items-center">
              <label className="block text-sm font-medium text-gray-700">
                Combinations ({entry.combinations.length})
              </label>
              <button
                type="button"
                onClick={() => addCombination(entry.id)}
                className="flex items-center space-x-1 px-2 py-1 text-xs text-blue-600 hover:text-blue-800"
              >
                <PlusCircle className="h-3 w-3" />
                <span>Add Combination</span>
              </button>
            </div>
            
            {entry.combinations.map((combo, comboIndex) => (
              <div 
                key={combo.id} 
                className={`mb-4 p-3 ${entry.combinations.length > 1 ? 'border rounded-md border-gray-200' : ''}`}
              >
                {entry.combinations.length > 1 && (
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-xs font-medium text-gray-600">Combination {comboIndex + 1}</span>
                    <button
                      type="button"
                      onClick={() => removeCombination(entry.id, combo.id)}
                      className="text-xs text-red-500 hover:text-red-700"
                    >
                      Remove
                    </button>
                  </div>
                )}
                
                <div className="mb-2">
                  <div className="flex flex-wrap items-center space-x-2">
                    {combo.whiteBalls.map((ball, index) => (
                      <div key={index} className="mb-2">
                        <input
                          type="number"
                          min="1"
                          max="69"
                          value={ball}
                          onChange={(e) => updateWhiteBall(entry.id, combo.id, index, e.target.value)}
                          className="w-16 rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                          placeholder={`#${index + 1}`}
                          required
                        />
                      </div>
                    ))}
                    
                    <div className="flex items-center mb-2">
                      <span className="px-2 text-gray-500">PB:</span>
                      <input
                        type="number"
                        min="1"
                        max="26"
                        value={combo.powerball}
                        onChange={(e) => updatePowerball(entry.id, combo.id, e.target.value)}
                        className="w-16 rounded-md border-red-300 shadow-sm focus:border-red-500 focus:ring-red-500"
                        placeholder="PB"
                        required
                      />
                    </div>
                  </div>
                </div>
                
                {/* Preview */}
                {combo.whiteBalls.every(ball => ball !== '') && combo.powerball && (
                  <div className="mt-2">
                    <p className="text-xs text-gray-600 mb-1">Preview:</p>
                    <div className="flex space-x-2">
                      {combo.whiteBalls.map((ball, index) => (
                        <NumberBall 
                          key={index} 
                          number={parseInt(ball, 10) || 0} 
                          isPowerball={false}
                          size={30}
                        />
                      ))}
                      <NumberBall 
                        number={parseInt(combo.powerball, 10) || 0} 
                        isPowerball={true}
                        size={30}
                      />
                    </div>
                  </div>
                )}
              </div>
            ))}
            
            {entryIndex < entries.length - 1 && (
              <div className="border-b border-gray-200 my-4"></div>
            )}
          </div>
        ))}

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={loading}
            className="inline-flex justify-center py-2 px-4 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
          >
            {loading ? (
              <span className="flex items-center">
                <LoadingSpinner size={20} color="#ffffff" />
                <span className="ml-2">Adding...</span>
              </span>
            ) : (
              `Add ${entries.length} Draw${entries.length > 1 ? 's' : ''}`
            )}
          </button>
        </div>
      </form>
    </div>
  );
};

export default BatchAddDraw;