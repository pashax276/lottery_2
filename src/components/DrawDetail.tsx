// src/components/DrawDetail.tsx
import React from 'react';
import NumberBall from './NumberBall';

interface PrizeBreakdown {
  tier: string;
  winners: number;
  prize: string;
}

interface DrawDetailProps {
  draw: {
    draw_number: number;
    draw_date: string;
    white_balls: number[];
    powerball: number;
    jackpot_amount?: number;
    winners?: number;
    prize_breakdown?: PrizeBreakdown[];
  };
  onClose: () => void;
}

const DrawDetail: React.FC<DrawDetailProps> = ({ draw, onClose }) => {
  // Calculate total winners if prize breakdown is available
  const totalWinners = draw.prize_breakdown
    ? draw.prize_breakdown.reduce((sum, prize) => {
        const winnerCount = typeof prize.winners === 'number' 
          ? prize.winners 
          : parseInt(prize.winners as unknown as string, 10) || 0;
        return sum + winnerCount;
      }, 0)
    : 0;
    
  return (
    <div className="fixed inset-0 bg-gray-600 bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl p-6 max-w-2xl w-full max-h-[90vh] overflow-auto">
        <h3 className="text-lg font-semibold mb-4">
          Detailed Draw Results for #{draw.draw_number}
        </h3>
        
        <div className="mb-6 flex flex-col items-center">
          <div className="mb-2 flex justify-center space-x-2">
            {draw.white_balls.map((number, idx) => (
              <NumberBall
                key={idx}
                number={number}
                isPowerball={false}
                size={40}
              />
            ))}
            <NumberBall
              number={draw.powerball}
              isPowerball={true}
              size={40}
            />
          </div>
          <p className="text-gray-600 text-sm">Draw Date: {draw.draw_date}</p>
          {draw.jackpot_amount && (
            <p className="text-gray-600 text-sm">
              Jackpot: ${draw.jackpot_amount.toLocaleString()}
            </p>
          )}
        </div>
        
        {draw.prize_breakdown && draw.prize_breakdown.length > 0 ? (
          <>
            <h4 className="font-medium text-gray-800 mb-2">Prize Breakdown</h4>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Matching Numbers
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Winning Tickets
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Prize Amounts
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {draw.prize_breakdown.map((prize, index) => (
                    <tr key={index} className={index % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {prize.tier}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {prize.winners}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {prize.prize}
                      </td>
                    </tr>
                  ))}
                  <tr className="bg-gray-100">
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                      Total Winning Tickets
                    </td>
                    <td colSpan={2} className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {totalWinners}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </>
        ) : (
          <div className="text-center py-4 mb-4">
            <p className="text-gray-500">Detailed prize breakdown not available for this draw.</p>
          </div>
        )}
        
        <div className="mt-6 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

export default DrawDetail;