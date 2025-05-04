import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line, Legend } from 'recharts';
import { BarChart3, PieChart, TrendingUp, Activity, Grid as GridIcon, Save } from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import io, { Socket } from 'socket.io-client';
import Plotly from 'plotly.js-dist-min';
import { Card, CardContent, Typography, Tabs, Tab, Slider, Button, Select, MenuItem, FormControl, InputLabel, Switch, Box, Grid, CircularProgress, TextField } from '@mui/material';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import NumberBall from './NumberBall';
import useLocalStorage from '../hooks/useLocalStorage'; // Corrected to default import
import { getFrequencyAnalysis, getHotNumbers, getDueNumbers, getPairs, getPositions, getPredictions } from '../lib/api';
import { processWhiteBalls, processPowerball } from '../utils/dataUtils';

interface FrequencyData {
  number: string;
  frequency: number;
}

interface PairData {
  pair: number[];
  count: number;
}

interface PositionData {
  position: number;
  top_numbers: { number: number; count: number }[];
}

interface ClusterData {
  centers: number[];
  clusters: Record<string, number[]>;
  cluster_averages: Record<string, number>;
  optimal_k: number;
}

interface PredictionData {
  white_balls: number[];
  powerball: number;
  confidence: number;
  method: string;
}

const Analysis = () => {
  const queryClient = useQueryClient();
  const [tab, setTab] = useLocalStorage<number>('analysis_tab', 0);
  const [loading, setLoading] = useState(false);
  const [viewMode, setViewMode] = useLocalStorage<'tiles' | 'charts'>('analysis_viewMode', 'tiles');
  const [lookback, setLookback] = useLocalStorage<number>('analysis_lookback', 50);
  const [selectedPosition, setSelectedPosition] = useLocalStorage<number>('analysis_position', 1);
  const [darkMode, setDarkMode] = useLocalStorage<boolean>('analysis_darkMode', false);
  const [customCombination, setCustomCombination] = useState<string>('');
  const [socket, setSocket] = useState<Socket | null>(null);

  const lightTheme = createTheme({
    palette: { mode: 'light', primary: { main: '#3B82F6' }, secondary: { main: '#EF4444' } },
  });
  const darkTheme = createTheme({
    palette: { mode: 'dark', primary: { main: '#60A5FA' }, secondary: { main: '#F87171' } },
  });
  const theme = darkMode ? darkTheme : lightTheme;

  // API fetch functions
  const fetchClusters = async () => {
    const response = await fetch('http://localhost:5001/api/insights/cluster');
    return (await response.json()).result;
  };

  // React Query hooks
  const { data: frequencyData = [], refetch: refetchFrequency } = useQuery({
    queryKey: ['frequency', lookback],
    queryFn: async () => {
      const { white_balls } = await (await getFrequencyAnalysis()).data;
      return Object.entries(white_balls)
        .map(([num, freq]) => ({ number: num, frequency: freq }))
        .sort((a, b) => parseInt(a.number) - parseInt(b.number));
    },
    staleTime: 1000 * 60 * 5,
  });

  const { data: hotNumbers = { white_balls: {} } } = useQuery({
    queryKey: ['hotNumbers'],
    queryFn: async () => (await getHotNumbers()).data,
    staleTime: 1000 * 60 * 5,
  });

  const { data: dueNumbers = { white_balls: {} } } = useQuery({
    queryKey: ['dueNumbers'],
    queryFn: async () => (await getDueNumbers()).data,
    staleTime: 1000 * 60 * 5,
  });

  const { data: pairData = { common_pairs: [] } } = useQuery({
    queryKey: ['pairs'],
    queryFn: async () => (await getPairs()).data,
    staleTime: 1000 * 60 * 5,
  });

  const { data: positionData = { positions: [] } } = useQuery({
    queryKey: ['positions'],
    queryFn: async () => (await getPositions()).data,
    staleTime: 1000 * 60 * 5,
  });

  const { data: clusterData = { centers: [], clusters: {}, cluster_averages: {}, optimal_k: 2 } } = useQuery({
    queryKey: ['clusters'],
    queryFn: fetchClusters,
    staleTime: 1000 * 60 * 5,
  });

  const { data: predictions = [] } = useQuery({
    queryKey: ['predictions'],
    queryFn: async () => (await getPredictions('all')).data,
    staleTime: 1000 * 60 * 5,
  });

  // WebSocket setup
  useEffect(() => {
    const socketInstance = io('http://localhost:5001');
    setSocket(socketInstance);

    socketInstance.on('new_draw', (draw) => {
      console.log('New draw received:', draw);
      queryClient.invalidateQueries(['frequency']);
      queryClient.invalidateQueries(['hotNumbers']);
      queryClient.invalidateQueries(['dueNumbers']);
      queryClient.invalidateQueries(['pairs']);
      queryClient.invalidateQueries(['positions']);
      queryClient.invalidateQueries(['clusters']);
      queryClient.invalidateQueries(['predictions']);
    });

    return () => {
      socketInstance.disconnect();
    };
  }, [queryClient]);

  // Pair frequency heatmap
  const renderPairHeatmap = useMemo(() => {
    const data = pairData.common_pairs.reduce((acc, { pair, count }) => {
      acc[pair[0]] = acc[pair[0]] || {};
      acc[pair[0]][pair[1]] = count;
      return acc;
    }, {} as Record<number, Record<number, number>>);

    const xValues = Array.from({ length: 69 }, (_, i) => i + 1);
    const yValues = xValues;
    const zValues = xValues.map(x => yValues.map(y => data[x]?.[y] || 0));

    return (
      <div id="pair-heatmap" style={{ width: '100%', height: '400px' }}>
        <Plotly.plot
          divId="pair-heatmap"
          data={[{
            type: 'heatmap',
            x: xValues,
            y: yValues,
            z: zValues,
            colorscale: 'Viridis',
            showscale: true,
            hoverinfo: 'x+y+z',
          }]}
          layout={{
            title: 'Pair Frequency Heatmap',
            xaxis: { title: 'Number 1', tickmode: 'array', tickvals: xValues.filter((_, i) => i % 5 === 0) },
            yaxis: { title: 'Number 2', tickmode: 'array', tickvals: yValues.filter((_, i) => i % 5 === 0) },
            paper_bgcolor: darkMode ? '#1d1d1d' : '#ffffff',
            plot_bgcolor: darkMode ? '#1d1d1d' : '#ffffff',
            font: { color: darkMode ? '#ffffff' : '#000000' },
            margin: { t: 50, r: 50, b: 100, l: 100 },
          }}
        />
      </div>
    );
  }, [pairData, darkMode]);

  // Cluster 3D plot
  const renderClusterPlot = useMemo(() => {
    const { clusters, centers } = clusterData;
    if (!Object.keys(clusters).length) return null;

    const data = Object.entries(clusters).flatMap(([label, numbers]) =>
      numbers.map((num, idx) => ({
        x: num,
        y: idx % 10,
        z: centers[parseInt(label)] || 0,
        cluster: label,
      }))
    );

    return (
      <div id="cluster-plot" style={{ width: '100%', height: '400px' }}>
        <Plotly.plot
          divId="cluster-plot"
          data={[{
            type: 'scatter3d',
            mode: 'markers',
            x: data.map(d => d.x),
            y: data.map(d => d.y),
            z: data.map(d => d.z),
            marker: {
              size: 6,
              color: data.map(d => parseInt(d.cluster)),
              colorscale: 'Viridis',
              showscale: true,
            },
            text: data.map(d => `Number: ${d.x}, Cluster: ${d.cluster}`),
            hoverinfo: 'text',
          }]}
          layout={{
            title: 'White Ball Cluster Analysis',
            scene: {
              xaxis: { title: 'Ball Number' },
              yaxis: { title: 'Index' },
              zaxis: { title: 'Cluster Center' },
            },
            paper_bgcolor: darkMode ? '#1d1d1d' : '#ffffff',
            plot_bgcolor: darkMode ? '#1d1d1d' : '#ffffff',
            font: { color: darkMode ? '#ffffff' : '#000000' },
          }}
        />
      </div>
    );
  }, [clusterData, darkMode]);

  // Prediction trends
  const renderPredictionTrends = useMemo(() => {
    const data = predictions.slice(0, 10).map((pred: PredictionData, idx: number) => ({
      index: idx,
      whiteSum: pred.white_balls.reduce((a, b) => a + b, 0),
      powerball: pred.powerball,
      confidence: pred.confidence,
    }));

    return (
      <Box height={400}>
        <ResponsiveContainer>
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="index" />
            <YAxis />
            <Tooltip />
            <Legend />
            <Line type="monotone" dataKey="whiteSum" stroke="#3B82F6" name="White Balls Sum" />
            <Line type="monotone" dataKey="powerball" stroke="#EF4444" name="Powerball" />
            <Line type="monotone" dataKey="confidence" stroke="#22C55E" name="Confidence (%)" />
          </LineChart>
        </ResponsiveContainer>
      </Box>
    );
  }, [predictions]);

  // Custom combination handler
  const handleCustomCombination = useCallback(async () => {
    if (!customCombination) return;
    try {
      setLoading(true);
      const numbers = customCombination.split(',').map(Number);
      if (numbers.length !== 6 || numbers.some(isNaN) || numbers.slice(0, 5).some(n => n < 1 || n > 69) || numbers[5] < 1 || numbers[5] > 26) {
        alert('Please enter 5 white balls (1-69) and 1 Powerball (1-26) separated by commas');
        return;
      }
      const response = await fetch('http://localhost:5001/api/combinations/update', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('token')}`,
        },
        body: JSON.stringify({
          white_balls: processWhiteBalls(numbers.slice(0, 5)),
          powerball: processPowerball(numbers[5]),
          score: 0.5,
          method: 'user_custom',
          reason: 'User-defined combination',
        }),
      });
      if (!response.ok) throw new Error('Failed to save combination');
      alert('Custom combination saved!');
      setCustomCombination('');
    } catch (error) {
      console.error('Error saving custom combination:', error);
      alert('Failed to save combination');
    } finally {
      setLoading(false);
    }
  }, [customCombination]);

  return (
    <ThemeProvider theme={theme}>
      <Box sx={{ p: 4, bgcolor: 'background.default', minHeight: '100vh' }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 4 }}>
          <Typography variant="h5" sx={{ fontWeight: 'bold' }}>
            Powerball Analytics
          </Typography>
          <Box sx={{ display: 'flex', gap: 2 }}>
            <FormControlLabel
              control={<Switch checked={darkMode} onChange={() => setDarkMode(!darkMode)} />}
              label={darkMode ? 'Dark Mode' : 'Light Mode'}
            />
            <Button variant="outlined" startIcon={<Save />} onClick={() => alert('Settings saved!')}>
              Save Settings
            </Button>
          </Box>
        </Box>

        <Tabs value={tab} onChange={(_, v) => setTab(v)} centered sx={{ mb: 3, bgcolor: 'background.paper' }}>
          <Tab label="Frequency" icon={<BarChart3 size={20} />} />
          <Tab label="Hot & Due" icon={<TrendingUp size={20} />} />
          <Tab label="Pairs" icon={<GridIcon size={20} />} />
          <Tab label="Position" icon={<Activity size={20} />} />
          <Tab label="Clusters" icon={<Activity size={20} />} />
          <Tab label="Predictions" icon={<TrendingUp size={20} />} />
          <Tab label="Custom" icon={<Save size={20} />} />
        </Tabs>

        {loading ? (
          <Box sx={{ textAlign: 'center', py: 4 }}>
            <CircularProgress />
          </Box>
        ) : (
          <Grid container spacing={3}>
            {tab === 0 && (
              <Grid item xs={12}>
                <Card>
                  <CardContent>
                    <Box display="flex" justifyContent="space-between" mb={2}>
                      <Typography variant="h6">Number Frequency Analysis</Typography>
                      <Box display="flex" alignItems="center">
                        <BarChart3 size={20} className="mr-2" />
                        <Typography variant="body2">Historical Data</Typography>
                      </Box>
                    </Box>
                    <Box mb={3}>
                      <Typography>Lookback Period (draws)</Typography>
                      <Slider
                        value={lookback}
                        onChange={(_, val) => setLookback(val as number)}
                        min={10}
                        max={100}
                        valueLabelDisplay="auto"
                        sx={{ width: '50%' }}
                        onChangeCommitted={() => refetchFrequency()}
                      />
                    </Box>
                    <Box height={400}>
                      <ResponsiveContainer>
                        <BarChart data={frequencyData}>
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis dataKey="number" />
                          <YAxis />
                          <Tooltip />
                          <Bar dataKey="frequency" fill="#3B82F6" />
                        </BarChart>
                      </ResponsiveContainer>
                    </Box>
                  </CardContent>
                </Card>
              </Grid>
            )}

            {tab === 1 && (
              <>
                <Grid item xs={12} md={6}>
                  <Card>
                    <CardContent>
                      <Box display="flex" justifyContent="space-between" mb={2}>
                        <Typography variant="h6">Hot Numbers</Typography>
                        <TrendingUp size={20} color="#22C55E" />
                      </Box>
                      <Box display="flex" flexWrap="wrap" gap={2}>
                        {Object.keys(hotNumbers.white_balls).slice(0, 5).map(Number).map((number) => (
                          <NumberBall key={number} number={number} />
                        ))}
                      </Box>
                    </CardContent>
                  </Card>
                </Grid>
                <Grid item xs={12} md={6}>
                  <Card>
                    <CardContent>
                      <Box display="flex" justifyContent="space-between" mb={2}>
                        <Typography variant="h6">Due Numbers</Typography>
                        <PieChart size={20} color="#F97316" />
                      </Box>
                      <Box display="flex" flexWrap="wrap" gap={2}>
                        {Object.keys(dueNumbers.white_balls).slice(0, 5).map(Number).map((number) => (
                          <NumberBall key={number} number={number} />
                        ))}
                      </Box>
                    </CardContent>
                  </Card>
                </Grid>
              </>
            )}

            {tab === 2 && (
              <Grid item xs={12}>
                <Card>
                  <CardContent>
                    <Box display="flex" justifyContent="space-between" mb={2}>
                      <Typography variant="h6">Common Number Pairs</Typography>
                      <FormControlLabel
                        control={<Switch checked={viewMode === 'charts'} onChange={() => setViewMode(viewMode === 'tiles' ? 'charts' : 'tiles')} />}
                        label={viewMode === 'tiles' ? 'Tiles' : 'Heatmap'}
                      />
                    </Box>
                    {viewMode === 'tiles' ? (
                      <Grid container spacing={2}>
                        {pairData.common_pairs.map(({ pair, count }, index) => (
                          <Grid item xs={6} sm={4} md={3} key={index}>
                            <Card sx={{ textAlign: 'center' }}>
                              <CardContent>
                                <Box display="flex" justifyContent="center" gap={1}>
                                  <NumberBall number={pair[0]} />
                                  <NumberBall number={pair[1]} />
                                </Box>
                                <Typography variant="body2" mt={1}>
                                  {count} occurrences
                                </Typography>
                              </CardContent>
                            </Card>
                          </Grid>
                        ))}
                      </Grid>
                    ) : (
                      <Box>
                        {renderPairHeatmap}
                      </Box>
                    )}
                  </CardContent>
                </Card>
              </Grid>
            )}

            {tab === 3 && (
              <Grid item xs={12}>
                <Card>
                  <CardContent>
                    <Typography variant="h6" mb={2}>Position Analysis</Typography>
                    <FormControl sx={{ minWidth: 200, mb: 3 }}>
                      <InputLabel>Position</InputLabel>
                      <Select
                        value={selectedPosition}
                        onChange={(e) => setSelectedPosition(Number(e.target.value))}
                        label="Position"
                      >
                        {[1, 2, 3, 4, 5, 6].map((pos) => (
                          <MenuItem key={pos} value={pos}>
                            {pos === 6 ? 'Powerball' : `White Ball ${pos}`}
                          </MenuItem>
                        ))}
                      </Select>
                    </FormControl>
                    <Button variant="contained" onClick={() => queryClient.invalidateQueries(['positions'])} sx={{ mb: 3 }}>
                      Refresh Analysis
                    </Button>
                    <Box height={400}>
                      <ResponsiveContainer>
                        <BarChart
                          data={positionData.positions
                            .find((p) => p.position === selectedPosition)
                            ?.top_numbers.map(({ number, count }) => ({ number, count })) || []}
                        >
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis dataKey="number" />
                          <YAxis />
                          <Tooltip />
                          <Bar dataKey="count" fill="#3B82F6" />
                        </BarChart>
                      </ResponsiveContainer>
                    </Box>
                  </CardContent>
                </Card>
              </Grid>
            )}

            {tab === 4 && (
              <Grid item xs={12}>
                <Card>
                  <CardContent>
                    <Typography variant="h6" mb={2}>Cluster Analysis</Typography>
                    {renderClusterPlot || <Typography>No cluster data available</Typography>}
                  </CardContent>
                </Card>
              </Grid>
            )}

            {tab === 5 && (
              <Grid item xs={12}>
                <Card>
                  <CardContent>
                    <Typography variant="h6" mb={2}>Prediction Trends</Typography>
                    {predictions.length ? renderPredictionTrends : <Typography>No prediction data available</Typography>}
                  </CardContent>
                </Card>
              </Grid>
            )}

            {tab === 6 && (
              <Grid item xs={12}>
                <Card>
                  <CardContent>
                    <Typography variant="h6" mb={2}>Custom Combinations</Typography>
                    <Box display="flex" gap={2} mb={3}>
                      <TextField
                        label="Enter 6 numbers (comma-separated)"
                        value={customCombination}
                        onChange={(e) => setCustomCombination(e.target.value)}
                        placeholder="1,2,3,4,5,6"
                        fullWidth
                      />
                      <Button variant="contained" onClick={handleCustomCombination} disabled={loading}>
                        Save Combination
                      </Button>
                    </Box>
                    <Typography variant="body2" color="text.secondary">
                      Enter 5 white ball numbers (1-69) and 1 Powerball (1-26) separated by commas.
                    </Typography>
                  </CardContent>
                </Card>
              </Grid>
            )}
          </Grid>
        )}
      </Box>
    </ThemeProvider>
  );
};

export default Analysis;