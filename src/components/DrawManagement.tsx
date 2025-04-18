import React, { useState } from 'react';
import { Database, FileUp, List, Search } from 'lucide-react';
import AddDraw from './AddDraw';
import BatchAddDraw from './BatchAddDraw';
import EnhancedFileUpload from './EnhancedFileUpload';
import CheckNumbers from './CheckNumbers';

const DrawManagement = () => {
  const [activeTab, setActiveTab] = useState('add-draw');

  return (
    <div className="space-y-6">
      <section className="bg-white rounded-lg shadow-sm p-6">
        <h2 className="text-xl font-semibold text-gray-900 mb-6">Draw Management</h2>
        
        {/* Tabs navigation */}
        <div className="mb-6">
          <div className="flex border-b border-gray-200 overflow-x-auto">
            <button
              onClick={() => setActiveTab('add-draw')}
              className={`flex items-center px-4 py-2 font-medium text-sm whitespace-nowrap ${
                activeTab === 'add-draw'
                  ? 'text-blue-600 border-b-2 border-blue-600'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              <Database className="mr-2 h-4 w-4" />
              Add Draw
            </button>

            <button
              onClick={() => setActiveTab('batch-add')}
              className={`flex items-center px-4 py-2 font-medium text-sm whitespace-nowrap ${
                activeTab === 'batch-add'
                  ? 'text-blue-600 border-b-2 border-blue-600'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              <List className="mr-2 h-4 w-4" />
              Batch Add
            </button>

            <button
              onClick={() => setActiveTab('file-upload')}
              className={`flex items-center px-4 py-2 font-medium text-sm whitespace-nowrap ${
                activeTab === 'file-upload'
                  ? 'text-blue-600 border-b-2 border-blue-600'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              <FileUp className="mr-2 h-4 w-4" />
              File Upload
            </button>

            <button
              onClick={() => setActiveTab('check-numbers')}
              className={`flex items-center px-4 py-2 font-medium text-sm whitespace-nowrap ${
                activeTab === 'check-numbers'
                  ? 'text-blue-600 border-b-2 border-blue-600'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              <Search className="mr-2 h-4 w-4" />
              Check Numbers
            </button>
          </div>
        </div>
        
        {/* Tab content */}
        <div>
          {activeTab === 'add-draw' && <AddDraw />}
          {activeTab === 'batch-add' && <BatchAddDraw />}
          {activeTab === 'file-upload' && <EnhancedFileUpload />}
          {activeTab === 'check-numbers' && <CheckNumbers />}
        </div>
      </section>
    </div>
  );
};

export default DrawManagement;