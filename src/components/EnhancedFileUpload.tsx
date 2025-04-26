import React, { useState, useCallback, useRef } from 'react';
import { Upload, AlertCircle, FileText, Check, X, Info } from 'lucide-react';
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

const EnhancedFileUpload: React.FC<FileUploadProps> = ({ onSuccess }) => {
  const [loading, setLoading] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [processingStatus, setProcessingStatus] = useState<{
    total: number;
    processed: number;
    success: number;
    failed: number;
    errors: string[];
  }>({ total: 0, processed: 0, success: 0, failed: 0, errors: [] });
  
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
    
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFiles([...e.dataTransfer.files]);
    }
  }, []);

  const handleFileInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      handleFiles([...e.target.files]);
    }
  }, []);

  const handleFiles = (newFiles: File[]) => {
    setSuccessMessage(null);
    
    const validFiles = newFiles.filter(file => 
      file.type === 'text/plain' || 
      file.type === 'text/csv' || 
      file.name.endsWith('.txt') || 
      file.name.endsWith('.csv')
    );
    
    if (validFiles.length !== newFiles.length) {
      showToast.error('Only TXT and CSV files are supported');
    }
    
    if (validFiles.length > 0) {
      setFiles(validFiles);
      setError(null);
    }
  };

  const removeFile = (index: number) => {
    setFiles(prev => prev.filter((_, i) => i !== index));
    setSuccessMessage(null);
  };

  const clearFiles = () => {
    setFiles([]);
    setProcessingStatus({ total: 0, processed: 0, success: 0, failed: 0, errors: [] });
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
    setSuccessMessage(null);
  };

  const processFile = async (file: File): Promise<DrawData[]> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      
      reader.onload = (e) => {
        try {
          const content = e.target?.result as string;
          const draws: DrawData[] = [];
          
          if (file.name.endsWith('.csv')) {
            const lines = content.split('\n').filter(line => line.trim() !== '');
            const startIndex = lines[0].toLowerCase().includes('draw') ||
                              lines[0].toLowerCase().includes('date') ||
                              lines[0].toLowerCase().includes('number') ? 1 : 0;
            
            for (let i = startIndex; i < lines.length; i++) {
              const line = lines[i].trim();
              const values = line.split(',').map(val => val.trim());
              
              if (values.length >= 8) {
                const drawNumber = parseInt(values[0], 10);
                let drawDate = values[1];
                
                if (!drawDate.match(/^\d{4}-\d{2}-\d{2}$/)) {
                  const dateParts = drawDate.split('/');
                  if (dateParts.length === 3) {
                    const month = dateParts[0].padStart(2, '0');
                    const day = dateParts[1].padStart(2, '0');
                    const year = dateParts[2].length === 2 ? `20${dateParts[2]}` : dateParts[2];
                    drawDate = `${year}-${month}-${day}`;
                  }
                }
                
                const whiteBalls = values.slice(2, 7).map(val => parseInt(val, 10));
                const powerball = parseInt(values[7], 10);
                
                const jackpotAmount = values[8] ? parseFloat(values[8]) : undefined;
                const winners = values[9] ? parseInt(values[9], 10) : undefined;
                
                draws.push({
                  drawNumber,
                  drawDate,
                  whiteBalls,
                  powerball,
                  jackpotAmount,
                  winners
                });
              }
            }
          } else {
            const lines = content.split('\n').filter(line => line.trim() !== '');
            
            for (const line of lines) {
              let values: string[];
              
              if (line.includes(',')) {
                values = line.split(',').map(val => val.trim());
              } else if (line.includes('\t')) {
                values = line.split('\t').map(val => val.trim());
              } else if (line.includes(' ')) {
                const parts = line.split(' ').filter(part => part.trim() !== '');
                
                if (parts.length >= 7) {
                  let dateEndIndex = -1;
                  for (let i = 1; i < parts.length - 6; i++) {
                    if (!isNaN(parseInt(parts[i + 1], 10))) {
                      dateEndIndex = i;
                      break;
                    }
                  }
                  
                  if (dateEndIndex > 0) {
                    const drawNumber = parts[0];
                    const drawDate = parts.slice(1, dateEndIndex + 1).join(' ');
                    const numbers = parts.slice(dateEndIndex + 1);
                    
                    values = [drawNumber, drawDate, ...numbers];
                  } else {
                    continue;
                  }
                } else {
                  continue;
                }
              } else {
                continue;
              }
              
              if (values.length >= 8) {
                const drawNumber = parseInt(values[0], 10);
                let drawDate = values[1];
                
                if (!drawDate.match(/^\d{4}-\d{2}-\d{2}$/)) {
                  const dateParts = drawDate.split('/');
                  if (dateParts.length === 3) {
                    const month = dateParts[0].padStart(2, '0');
                    const day = dateParts[1].padStart(2, '0');
                    const year = dateParts[2].length === 2 ? `20${dateParts[2]}` : dateParts[2];
                    drawDate = `${year}-${month}-${day}`;
                  }
                }
                
                const whiteBalls = values.slice(2, 7).map(val => parseInt(val, 10));
                const powerball = parseInt(values[7], 10);
                
                draws.push({
                  drawNumber,
                  drawDate,
                  whiteBalls,
                  powerball
                });
              }
            }
          }
          
          resolve(draws);
        } catch (error) {
          reject(error);
        }
      };
      
      reader.onerror = () => {
        reject(new Error('Failed to read file'));
      };
      
      reader.readAsText(file);
    });
  };

  const uploadDraws = async () => {
    if (files.length === 0) {
      showToast.error('Please select at least one file');
      return;
    }
    
    setLoading(true);
    setError(null);
    setSuccessMessage(null);
    setProcessingStatus({ total: 0, processed: 0, success: 0, failed: 0, errors: [] });
    
    try {
      let totalDraws = 0;
      let processedDraws = 0;
      let successfulDraws = 0;
      let failedDraws = 0;
      let errorMessages: string[] = [];
      
      for (const file of files) {
        try {
          const draws = await processFile(file);
          totalDraws += draws.length;
          
          setProcessingStatus(prev => ({
            ...prev,
            total: totalDraws,
            errors: []
          }));
          
          for (const draw of draws) {
            try {
              const response = await addDraw(
                draw.drawNumber,
                draw.drawDate,
                draw.whiteBalls,
                draw.powerball,
                draw.jackpotAmount,
                draw.winners
              );
              
              console.log(`API response for draw ${draw.drawNumber}:`, response);
              
              if (response.success && response.draw) {
                successfulDraws++;
              } else {
                throw new Error(`API returned unsuccessful response: ${JSON.stringify(response)}`);
              }
            } catch (error) {
              failedDraws++;
              const errorMsg = `Failed to add draw ${draw.drawNumber}: ${error instanceof Error ? error.message : String(error)}`;
              errorMessages.push(errorMsg);
              console.error(errorMsg);
            } finally {
              processedDraws++;
              
              setProcessingStatus({
                total: totalDraws,
                processed: processedDraws,
                success: successfulDraws,
                failed: failedDraws,
                errors: errorMessages
              });
            }
          }
        } catch (error) {
          const fileError = `Error processing file ${file.name}: ${error instanceof Error ? error.message : String(error)}`;
          setError(fileError);
          errorMessages.push(fileError);
        }
      }
      
      if (successfulDraws > 0) {
        const successMsg = `Successfully added ${successfulDraws} draw${successfulDraws > 1 ? 's' : ''} to the database`;
        setSuccessMessage(successMsg);
        showToast.success(successMsg);
        
        if (onSuccess) {
          onSuccess(successfulDraws);
        }
      }
      
      if (failedDraws > 0) {
        showToast.error(`Failed to add ${failedDraws} draw${failedDraws > 1 ? 's' : ''}. Check console for details.`);
      }
      
      if (successfulDraws > 0 && failedDraws === 0) {
        setFiles([]);
        if (fileInputRef.current) {
          fileInputRef.current.value = '';
        }
      }
      
      if (errorMessages.length > 0) {
        setError(errorMessages.join('; '));
      }
    } catch (error) {
      const generalError = `Error processing files: ${error instanceof Error ? error.message : String(error)}`;
      setError(generalError);
      showToast.error(generalError);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-white rounded-lg shadow-sm p-6">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center space-x-3">
          <Upload className="h-6 w-6 text-blue-600" />
          <h2 className="text-lg font-semibold text-gray-900">File Upload</h2>
        </div>
      </div>

      {successMessage && (
        <div className="mb-4 p-3 bg-green-50 text-green-800 rounded-md flex items-center space-x-2">
          <Check className="h-5 w-5 text-green-600" />
          <p className="text-sm">{successMessage}</p>
        </div>
      )}

      <div className="info-box bg-blue-50 p-4 rounded-md mb-4 flex items-start space-x-3">
        <Info className="h-5 w-5 text-blue-600 mt-0.5" />
        <div className="text-sm text-blue-800">
          <p className="font-medium">Supported file formats:</p>
          <ul className="list-disc list-inside ml-2 mt-1">
            <li>CSV files: DrawNumber,Date,Number1,Number2,Number3,Number4,Number5,Powerball</li>
            <li>TXT files: One draw per line with numbers space/tab/comma separated</li>
          </ul>
          <p className="mt-2">Uploaded draws will appear in History and Dashboard.</p>
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
        />
        <label
          htmlFor="file-upload"
          className="cursor-pointer flex flex-col items-center justify-center"
        >
          <Upload className="h-12 w-12 text-blue-500 mb-3" />
          <p className="text-lg font-medium text-gray-700 mb-1">
            Drag and drop your files here
          </p>
          <p className="text-sm text-gray-500 mb-3">
            or <span className="text-blue-600 font-medium">browse files</span>
          </p>
          <span className="text-xs text-gray-500">
            (Accepts CSV and TXT files)
          </span>
        </label>
      </div>

      {files.length > 0 && (
        <div className="mb-4">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-medium text-gray-700">Selected Files</h3>
            <button
              type="button"
              onClick={clearFiles}
              className="text-sm text-red-600 hover:text-red-800"
              disabled={loading}
            >
              Clear All
            </button>
          </div>
          <div className="bg-gray-50 rounded-md p-2 max-h-40 overflow-y-auto">
            {files.map((file, index) => (
              <div
                key={index}
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
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {error && (
        <div className="mb-4 p-3 bg-red-50 text-red-800 rounded-md flex items-start space-x-2">
          <AlertCircle className="h-5 w-5 text-red-600" />
          <p className="text-sm">{error}</p>
        </div>
      )}

      {processingStatus.total > 0 && (
        <div className="mb-4">
          <div className="flex justify-between text-sm text-gray-700 mb-1">
            <span>Processing files...</span>
            <span>
              {processingStatus.processed} / {processingStatus.total} draws
            </span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2.5">
            <div
              className="bg-blue-600 h-2.5 rounded-full"
              style={{
                width: `${processingStatus.total ? 
                  Math.round((processingStatus.processed / processingStatus.total) * 100) : 0}%`,
              }}
            ></div>
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
          {processingStatus.errors.length > 0 && (
            <div className="mt-2 text-xs text-red-600">
              <p>Errors:</p>
              <ul className="list-disc list-inside">
                {processingStatus.errors.map((err, idx) => (
                  <li key={idx}>{err}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      <div className="mt-4">
        <button
          type="button"
          onClick={uploadDraws}
          disabled={loading || files.length === 0}
          className="w-full flex justify-center items-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
        >
          {loading ? (
            <>
              <LoadingSpinner size={20} color="#ffffff" />
              <span className="ml-2">Processing...</span>
            </>
          ) : (
            <>
              <Upload className="h-4 w-4 mr-2" />
              <span>Upload {files.length > 0 ? `${files.length} File${files.length > 1 ? 's' : ''}` : 'Files'}</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
};

export default EnhancedFileUpload;