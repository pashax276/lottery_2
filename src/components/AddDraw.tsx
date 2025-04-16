import React, { useState, useEffect } from 'react';
import { Plus } from 'lucide-react';
import { addDraw, validateDrawParameters } from '../lib/api';
import { showToast } from './Toast';
import NumberBall from './NumberBall';
import LoadingSpinner from './LoadingSpinner';

// Define an interface for validation errors
interface ValidationResult {
  isValid: boolean;
  errors: string[];
}

const AddDraw = () => {
  const [drawNumber, setDrawNumber] = useState('');
  const [drawDate, setDrawDate] = useState('');
  const [numbers, setNumbers] = useState(['', '', '', '', '', '']);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [validation, setValidation] = useState<ValidationResult>({ 
    isValid: true, 
    errors: [] 
  });
  const [showPreview, setShowPreview] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  
  // Perform validation whenever form fields change
  useEffect(() => {
    // Only validate if we have values to validate
    if (drawNumber || drawDate || numbers.some(n => n !== '')) {
      const result = validateDrawParameters(
        drawNumber,
        drawDate,
        numbers.slice(0, 5),
        numbers[5]
      );
      
      setValidation(result);
      setShowPreview(result.isValid);
    } else {
      // Reset validation if form is empty
      setValidation({ isValid: true, errors: [] });
      setShowPreview(false);
    }
  }, [drawNumber, drawDate, numbers]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    
    if (name === 'drawNumber') {
      setDrawNumber(value);
    } else if (name === 'drawDate') {
      setDrawDate(value);
    }
    
    // Clear error and success message when form changes
    setError(null);
    setSuccessMessage(null);
  };

  const handleNumberChange = (index: number, value: string) => {
    const newNumbers = [...numbers];
    newNumbers[index] = value;
    setNumbers(newNumbers);
    
    // Clear error and success message when form changes
    setError(null);
    setSuccessMessage(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Double-check validation
    const validationResult = validateDrawParameters(
      drawNumber,
      drawDate,
      numbers.slice(0, 5),
      numbers[5]
    );
    
    if (!validationResult.isValid) {
      setError(validationResult.errors.join(', '));
      return;
    }
    
    setLoading(true);
    setError(null);

    try {
      const numericNumbers = numbers.map(n => parseInt(n, 10));
      await addDraw(
        parseInt(drawNumber, 10),
        drawDate,
        numericNumbers.slice(0, 5),
        numericNumbers[5]
      );
      
      // Show success message instead of redirecting
      setSuccessMessage(`Draw #${drawNumber} added successfully!`);
      showToast.success('Draw added successfully');
      
      // Reset form after successful submission
      setDrawNumber('');
      setDrawDate('');
      setNumbers(['', '', '', '', '', '']);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add draw');
      showToast.error(err instanceof Error ? err.message : 'Failed to add draw');
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

      {successMessage && (
        <div className="mb-4 p-3 bg-green-50 text-green-800 rounded-md">
          {successMessage}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label htmlFor="drawNumber" className="block text-sm font-medium text-gray-700">
              Draw Number
              {validation.errors.some(err => err.includes('Draw number')) && (
                <span className="text-red-500 ml-1">*</span>
              )}
            </label>
            <input
              type="number"
              id="drawNumber"
              name="drawNumber"
              value={drawNumber}
              onChange={handleChange}
              className={`mt-1 block w-full rounded-md ${
                validation.errors.some(err => err.includes('Draw number'))
                  ? 'border-red-300 focus:ring-red-500 focus:border-red-500'
                  : 'border-gray-300 focus:ring-blue-500 focus:border-blue-500'
              }`}
              required
            />
            {validation.errors.some(err => err.includes('Draw number')) && (
              <p className="mt-1 text-sm text-red-600">
                {validation.errors.find(err => err.includes('Draw number'))}
              </p>
            )}
          </div>
          <div>
            <label htmlFor="drawDate" className="block text-sm font-medium text-gray-700">
              Draw Date
              {validation.errors.some(err => err.includes('Draw date')) && (
                <span className="text-red-500 ml-1">*</span>
              )}
            </label>
            <input
              type="date"
              id="drawDate"
              name="drawDate"
              value={drawDate}
              onChange={handleChange}
              className={`mt-1 block w-full rounded-md ${
                validation.errors.some(err => err.includes('Draw date'))
                  ? 'border-red-300 focus:ring-red-500 focus:border-red-500'
                  : 'border-gray-300 focus:ring-blue-500 focus:border-blue-500'
              }`}
              required
            />
            {validation.errors.some(err => err.includes('Draw date')) && (
              <p className="mt-1 text-sm text-red-600">
                {validation.errors.find(err => err.includes('Draw date'))}
              </p>
            )}
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Numbers
            {validation.errors.some(err => err.includes('White ball') || err.includes('white balls') || err.includes('Powerball')) && (
              <span className="text-red-500 ml-1">*</span>
            )}
          </label>
          <div className="grid grid-cols-6 gap-2">
            {numbers.slice(0, 5).map((number, index) => (
              <input
                key={index}
                type="number"
                min="1"
                max="69"
                value={number}
                onChange={(e) => handleNumberChange(index, e.target.value)}
                className={`block w-full rounded-md ${
                  validation.errors.some(err => 
                    err.includes(`White ball #${index + 1}`) || 
                    err.includes('white balls')
                  )
                    ? 'border-red-300 focus:ring-red-500 focus:border-red-500'
                    : 'border-gray-300 focus:ring-blue-500 focus:border-blue-500'
                }`}
                placeholder={`#${index + 1}`}
                required
              />
            ))}
            <input
              type="number"
              min="1"
              max="26"
              value={numbers[5]}
              onChange={(e) => handleNumberChange(5, e.target.value)}
              className={`block w-full rounded-md ${
                validation.errors.some(err => err.includes('Powerball'))
                  ? 'border-red-300 focus:ring-red-500 focus:border-red-500'
                  : 'border-red-300 focus:ring-red-500 focus:border-red-500'
              }`}
              placeholder="PB"
              required
            />
          </div>
          {validation.errors.some(err => 
            err.includes('White ball') || 
            err.includes('white balls') || 
            err.includes('Powerball')
          ) && (
            <div className="mt-1 text-sm text-red-600">
              {validation.errors
                .filter(err => 
                  err.includes('White ball') || 
                  err.includes('white balls') || 
                  err.includes('Powerball')
                )
                .map((err, idx) => (
                  <p key={idx}>{err}</p>
                ))
              }
            </div>
          )}
        </div>

        {/* Preview of numbers if valid */}
        {showPreview && !numbers.some(n => n === '') && (
          <div className="mt-2 p-4 bg-gray-50 rounded-lg">
            <p className="text-sm text-gray-600 mb-2">Preview:</p>
            <div className="flex space-x-2">
              {numbers.slice(0, 5).map((number, index) => (
                <NumberBall 
                  key={index} 
                  number={parseInt(number, 10) || 0} 
                  isPowerball={false}
                  size={30}
                />
              ))}
              <NumberBall 
                number={parseInt(numbers[5], 10) || 0} 
                isPowerball={true}
                size={30}
              />
            </div>
          </div>
        )}

        {error && (
          <div className="text-red-600 text-sm">{error}</div>
        )}

        <button
          type="submit"
          disabled={loading || !validation.isValid}
          className="w-full py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
        >
          {loading ? (
            <span className="flex items-center justify-center">
              <LoadingSpinner size={20} color="#ffffff" />
              <span className="ml-2">Adding...</span>
            </span>
          ) : (
            'Add Draw'
          )}
        </button>
      </form>
    </div>
  );
};

export default AddDraw;