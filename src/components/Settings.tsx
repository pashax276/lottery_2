import React from 'react';
import { Bell, Mail, Shield, User } from 'lucide-react';
import AddDraw from './AddDraw';
import FileUpload from './FileUpload';
import ManualScraper from './ManualScraper';

const Settings = () => {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <AddDraw />
        <FileUpload />
      </div>

      <ManualScraper />

      <section className="bg-white rounded-lg shadow-sm p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-6">Settings</h2>

        <div className="space-y-6">
          {/* Notifications */}
          <div className="border-b pb-6">
            <div className="flex items-center space-x-2 mb-4">
              <Bell className="h-5 w-5 text-blue-600" />
              <h3 className="text-lg font-medium text-gray-900">Notifications</h3>
            </div>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-700">Draw Results</span>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input type="checkbox" className="sr-only peer" defaultChecked />
                  <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                </label>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-700">Predictions</span>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input type="checkbox" className="sr-only peer" defaultChecked />
                  <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                </label>
              </div>
            </div>
          </div>

          {/* Account Settings */}
          <div className="border-b pb-6">
            <div className="flex items-center space-x-2 mb-4">
              <User className="h-5 w-5 text-blue-600" />
              <h3 className="text-lg font-medium text-gray-900">Account</h3>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">Email</label>
                <input
                  type="email"
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
                  placeholder="your@email.com"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Name</label>
                <input
                  type="text"
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
                  placeholder="Your Name"
                />
              </div>
            </div>
          </div>

          {/* Security */}
          <div>
            <div className="flex items-center space-x-2 mb-4">
              <Shield className="h-5 w-5 text-blue-600" />
              <h3 className="text-lg font-medium text-gray-900">Security</h3>
            </div>
            <button className="w-full py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500">
              Change Password
            </button>
          </div>
        </div>
      </section>
    </div>
  );
};

export default Settings;