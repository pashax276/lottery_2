import React, { useState, useCallback, useRef, useMemo } from 'react';
import { Upload, AlertCircle, FileText, Check, X } from 'lucide-react';
import { showToast } from './Toast';
import { addDraw } from '../lib/api';
import LoadingSpinner from './LoadingSpinner';

interface DrawData {
  drawNumber: number;
  drawDate: string;
  whiteBalls: number[];
  powerball: number;
  jackpotAmount?: number;
  winners?: number;
}

interface FileUploadProps {
  onSuccess?: (count: number) => void;
}

const BATCH_SIZE = 50; // Number of draws to process in one API call

// Utility function to parse file content
const parseFileContent = (content: string, fileName: string): DrawData[] => {
  const draws: DrawData[] = [];
  const lines = content.split('\n').filter(line => line.trim());

  // Determine if the first line is a header
  const startIndex = lines[0].toLowerCase().includes('draw') ||
                     lines[0].toLowerCase().includes('date') ||
                     lines[0].toLowerCase().includes('number') ? 1 : 0;

  const isCSV = fileName.endsWith('.csv');

  for (let i = startIndex; i < lines.length; i++) {
    const line = lines[i].trim();
    let values: string[];

    if (isCSV || line.includes(',')) {
      values = line.split(',').map(val => val.trim());
    } else if (line.includes('\t')) {
      values = line.split('\t').map(val => val.trim());
    } else {
      // Space-separated with special handling for dates
      const parts = line.split(/\s+/).filter(part => part.trim());
      if (parts.length >= 8) {
        // Assume format: DrawNumber Date Num1 Num2 Num3 Num4 Num5 PB
        const dateEndIndex = parts.findIndex((part, idx) => idx > 1 && !isNaN(parseInt(part, 10))) - 1;
        if (dateEndIndex > 0) {
          values = [
            parts[0], // drawNumber
            parts.slice(1, dateEndIndex + 1).join(' '), // date
            ...parts.slice(dateEndIndex + 1), // numbers
          ];
        } else {
          continue; // Skip malformed lines
        }
      } else {
        continue;
      }
    }

    if (values.length < 8) {
      throw new Error(`Invalid format at line ${i + 1}: Expected at least 8 columns`);
    }

    const drawNumber = parseInt(values[0], 10);
    if (isNaN(drawNumber)) {
      throw new Error(`Invalid draw number at line ${i + 1}`);
    }

    let drawDate = values[1];
    // Standardize date to YYYY-MM-DD
    if (!drawDate.match(/^\d{4}-\d{2}-\d{2}$/)) {
      const dateParts = drawDate.split('/');
      if (dateParts.length === 3) {
        const [month, day, year] = dateParts;
        const fullYear = year.length === 2 ? `20${year}` : year;
        drawDate = `${fullYear}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
      } else {
        throw new Error(`Invalid date format at line ${i + 1}: ${drawDate}`);
      }
    }

    const whiteBalls = values.slice(2, 7).map((val, idx) => {
      const num = parseInt(val, 10);
      if (isNaN(num) || num < 1 || num > 69) {
        throw new Error(`Invalid white ball number ${idx + 1} at line ${i + 1}: ${val}`);
      }
      return num;
    });

    const powerball = parseInt(values[7], 10);
    if (isNaN(powerball) || powerball < 1 || powerball > 26) {
      throw new Error(`Invalid Powerball number at line ${i + 1}: ${values[7]}`);
    }

    const jackpotAmount = values[8] ? parseFloat(values[8]) : undefined;
    const winners = values[9] ? parseInt(values[9], 10) : undefined;

    draws.push({
      drawNumber,
      drawDate,
      whiteBalls,
      powerball,
      jackpotAmount: isNaN(jackpotAmount) ? undefined : jackpotAmount,
      winners: isNaN(winners) ? undefined : winners,
    });
  }

  return draws;
};

const EnhancedFileUpload: React.FC<FileUploadProps> = ({ onSuccess }) => {
  const [loading, setLoading] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [processingStatus, setProcessingStatus] = useState<{
    total: number;
    processed: number;
    success: number;
    failed: number;
  }>({ total: 0, processed: 0, success: 0, failed: 0 });

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files?.length) {
      handleFiles([...e.dataTransfer.files]);
    }
  }, []);

  const handleFileInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.length) {
      handleFiles([...e.target.files]);
    }
  }, []);

  const handleFiles = useCallback((newFiles: File[]) => {
    const validFiles = newFiles.filter(file =>
      file.type === 'text/plain' ||
      file.type === 'text/csv' ||
      file.name.toLowerCase().endsWith('.txt') ||
      file.name.toLowerCase().endsWith('.csv')
    );

    if (validFiles.length !== newFiles.length) {
      showToast.error('Only TXT and CSV files are supported');
    }

    if (validFiles.length > 0) {
      setFiles(prev => [...prev, ...validFiles]);
      setError(null);
    }
  }, []);

  const removeFile = useCallback((index: number) => {
    setFiles(prev => prev.filter((_, i) => i !== index));
  }, []);

  const clearFiles = useCallback(() => {
    setFiles([]);
    setProcessingStatus({ total: 0, processed: 0, success: 0, failed: 0 });
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }, []);

  const uploadDraws = useCallback(async () => {
    if (!files.length) {
      showToast.error('Please select at least one file');
      return;
    }

    setLoading(true);
    setError(null);
    setProcessingStatus({ total: 0, processed: 0, success: 0, failed: 0 });

    let totalDraws = 0;
    let processedDraws = 0;
    let successfulDraws = 0;
    let failedDraws = 0;

    try {
      for (const file of files) {
        try {
          const content = await file.text();
          const draws = parseFileContent(content, file.name);
          totalDraws += draws.length;

          setProcessingStatus(prev => ({ ...prev, total: totalDraws }));

          // Batch processing
          for (let i = 0; i < draws.length; i += BATCH_SIZE) {
            const batch = draws.slice(i, i + BATCH_SIZE);
            try {
              await Promise.all(
                batch.map(draw =>
                  addDraw(
                    draw.drawNumber,
                    draw.drawDate,
                    draw.whiteBalls,
                    draw.powerball,
                    draw.jackpotAmount,
                    draw.winners
                  )
                    .then(() => ({ success: true }))
                    .catch(error => ({ success: false, error }))
                )
              ).then(results => {
                results.forEach(result => {
                  if (result.success) {
                    successfulDraws++;
                  } else {
                    failedDraws++;
                    console.error(`Failed to add draw:`, result.error);
                  }
                  processedDraws++;
                  setProcessingStatus({
                    total: totalDraws,
                    processed: processedDraws,
                    success: successfulDraws,
                    failed: failedDraws,
                  });
                });
              });
            } catch (batchError) {
              failedDraws += batch.length;
              processedDraws += batch.length;
              setProcessingStatus({
                total: totalDraws,
                processed: processedDraws,
                success: successfulDraws,
                failed: failedDraws,
              });
              console.error(`Batch processing error:`, batchError);
            }
          }
        } catch (fileError) {
          setError(`Error processing ${file.name}: ${fileError instanceof Error ? fileError.message : String(fileError)}`);
        }
      }

      if (successfulDraws > 0) {
        showToast.success(`Successfully added ${successfulDraws} draw${successfulDraws > 1 ? 's' : ''}`);
        onSuccess?.(successfulDraws);
        clearFiles();
      }
      if (failedDraws > 0) {
        showToast.error(`Failed to add ${failedDraws} draw${failedDraws > 1 ? 's' : ''}`);
      }
    } catch (error) {
      setError(`Error processing files: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setLoading(false);
    }
  }, [files, onSuccess, clearFiles]);

  const fileList = useMemo(() => (
    files.map((file, index) => (
      <div
        key={`${file.name}-${index}`}
        className="flex items-center justify-between py-2 px-3 hover:bg-gray-100 rounded-md"
      >
        <div className="flex items-center">
          <FileText className="h-4 w-4 text-gray-500 mr-2" />
          <span className="text-sm text-gray-800 truncate max-w-xs">
            {file.name}
          </span>
          <span className="text-xs text-gray-500 ml-2">
            ({(file.size / 1024).toFixed(1)} KB)
          </span>
        </div>
        <button
          type="button"
          onClick={() => removeFile(index)}
          className="text-gray-400 hover:text-red-500"
          disabled={loading}
          aria-label={`Remove ${file.name}`}
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    ))
  ), [files, loading, removeFile]);

  return (
    <div className="bg-white rounded-lg shadow-sm p-6">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center space-x-3">
          <Upload className="h-6 w-6 text-blue-600" />
          <h2 className="text-lg font-semibold text-gray-900">Upload Draws</h2>
        </div>
      </div>

      <div className="bg-blue-50 p-4 rounded-md mb-4 flex items-start space-x-3">
        <svg className="h-5 w-5 text-blue-600 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <div className="text-sm text-blue-800">
          <p className="font-medium">Supported formats:</p>
          <ul className="list-disc list-inside ml-2 mt-1">
            <li>CSV: DrawNumber,Date,Number1,Number2,Number3,Number4,Number5,Powerball[,Jackpot,Winners]</li>
            <li>TXT: Space, tab, or comma-separated draws (one per line)</li>
          </ul>
        </div>
      </div>

      <div
        className={`border-2 border-dashed rounded-lg p-6 text-center mb-4 ${
          dragActive ? 'border-blue-500 bg-blue-50' : 'border-gray-300 hover:border-blue-400'
        }`}
        onDragEnter={handleDrag}
        onDragLeave={handleDrag}
        onDragOver={handleDrag}
        onDrop={handleDrop}
        role="region"
        aria-label="File upload area"
      >
        <input
          type="file"
          accept=".csv,.txt"
          onChange={handleFileInputChange}
          className="hidden"
          id="file-upload"
          multiple
          ref={fileInputRef}
          disabled={loading}
          aria-describedby="file-upload-instructions"
        />
        <label
          htmlFor="file-upload"
          className="cursor-pointer flex flex-col items-center justify-center"
        >
          <Upload className="h-12 w-12 text-blue-500 mb-3" />
          <p className="text-lg font-medium text-gray-700 mb-1">
            Drag and drop files here
          </p>
          <p className="text-sm text-gray-500 mb-3">
            or <span className="text-blue-600 font-medium">browse</span>
          </p>
          <span id="file-upload-instructions" className="text-xs text-gray-500">
            Accepts CSV and TXT files
          </span>
        </label>
      </div>

      {files.length > 0 && (
        <div className="mb-4">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-medium text-gray-700">Selected Files ({files.length})</h3>
            <button
              type="button"
              onClick={clearFiles}
              className="text-sm text-red-600 hover:text-red-800"
              disabled={loading}
              aria-label="Clear all files"
            >
              Clear All
            </button>
          </div>
          <div className="bg-gray-50 rounded-md p-2 max-h-40 overflow-y-auto">
            {fileList}
          </div>
        </div>
      )}

      {error && (
        <div className="mb-4 p-3 bg-red-50 text-red-800 rounded-md flex items-center space-x-2">
          <AlertCircle className="h-5 w-5 text-red-600" />
          <p className="text-sm">{error}</p>
        </div>
      )}

      {processingStatus.total > 0 && (
        <div className="mb-4">
          <div className="flex justify-between text-sm text-gray-700 mb-1">
            <span>Processing...</span>
            <span>
              {processingStatus.processed} / {processingStatus.total} draws
            </span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2.5">
            <div
              className="bg-blue-600 h-2.5 rounded-full"
              style={{
                width: `${
                  processingStatus.total ? Math.round((processingStatus.processed / processingStatus.total) * 100) : 0
                }%`,
              }}
            />
          </div>
          <div className="flex justify-between text-xs text-gray-500 mt-1">
            <span className="flex items-center">
              <Check className="h-3 w-3 text-green-500 mr-1" />
              {processingStatus.success} successful
            </span>
            {processingStatus.failed > 0 && (
              <span className="flex items-center">
                <X className="h-3 w-3 text-red-500 mr-1" />
                {processingStatus.failed} failed
              </span>
            )}
          </div>
        </div>
      )}

      <button
        type="button"
        onClick={uploadDraws}
        disabled={loading || !files.length}
        className="w-full flex justify-center items-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
        aria-label="Upload selected files"
      >
        {loading ? (
          <>
            <LoadingSpinner size={20} color="#ffffff" />
            <span className="ml-2">Processing...</span>
          </>
        ) : (
          <>
            <Upload className="h-4 w-4 mr-2" />
            Upload {files.length} File{files.length !== 1 ? 's' : ''}
          </>
        )}
      </button>
    </div>
  );
};

export default EnhancedFileUpload;