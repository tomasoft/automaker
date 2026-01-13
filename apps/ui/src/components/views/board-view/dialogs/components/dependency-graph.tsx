/**
 * Dependency Graph Visualization
 *
 * Interactive D3.js force-directed graph showing file dependencies
 */

import React, { useEffect, useRef, useState } from 'react';
import * as d3 from 'd3';
import type { DirectImpact, AffectedFile } from '@automaker/types';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ZoomIn, ZoomOut, Maximize2 } from 'lucide-react';

interface DependencyGraphProps {
  affectedFiles: AffectedFile[];
  directImpacts: DirectImpact[];
  indirectImpacts: DirectImpact[];
}

interface GraphNode extends d3.SimulationNodeDatum {
  id: string;
  label: string;
  type: 'affected' | 'direct' | 'indirect';
  hops: number;
  exists: boolean;
  x?: number;
  y?: number;
  fx?: number | null;
  fy?: number | null;
}

interface GraphLink extends d3.SimulationLinkDatum<GraphNode> {
  source: string | GraphNode;
  target: string | GraphNode;
  relationship: string;
  hops: number;
}

export function DependencyGraph({
  affectedFiles,
  directImpacts,
  indirectImpacts,
}: DependencyGraphProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 });

  useEffect(() => {
    if (!svgRef.current || !containerRef.current) return;

    // Get container dimensions
    const container = containerRef.current;
    const rect = container.getBoundingClientRect();
    setDimensions({ width: rect.width, height: 600 });

    // Build graph data
    const nodes: GraphNode[] = [];
    const links: GraphLink[] = [];
    const nodeMap = new Map<string, GraphNode>();

    // Add affected files as nodes
    affectedFiles.forEach((file) => {
      const node: GraphNode = {
        id: file.path,
        label: file.path.split('/').pop() || file.path,
        type: 'affected',
        hops: 0,
        exists: file.exists,
      };
      nodes.push(node);
      nodeMap.set(file.path, node);
    });

    // Add direct impacts
    directImpacts.forEach((impact) => {
      if (!nodeMap.has(impact.file)) {
        const node: GraphNode = {
          id: impact.file,
          label: impact.file.split('/').pop() || impact.file,
          type: 'direct',
          hops: impact.hops,
          exists: true,
        };
        nodes.push(node);
        nodeMap.set(impact.file, node);
      }

      // Create link from affected file to impacted file
      const sourceFile = affectedFiles.find((f) => f.path === impact.file) || affectedFiles[0];
      if (sourceFile) {
        links.push({
          source: sourceFile.path,
          target: impact.file,
          relationship: impact.relationship,
          hops: impact.hops,
        });
      }
    });

    // Add indirect impacts
    indirectImpacts.forEach((impact) => {
      if (!nodeMap.has(impact.file)) {
        const node: GraphNode = {
          id: impact.file,
          label: impact.file.split('/').pop() || impact.file,
          type: 'indirect',
          hops: impact.hops,
          exists: true,
        };
        nodes.push(node);
        nodeMap.set(impact.file, node);
      }

      links.push({
        source: affectedFiles[0]?.path || impact.file,
        target: impact.file,
        relationship: impact.relationship,
        hops: impact.hops,
      });
    });

    // Clear previous graph
    d3.select(svgRef.current).selectAll('*').remove();

    // Create SVG
    const svg = d3
      .select(svgRef.current)
      .attr('width', dimensions.width)
      .attr('height', dimensions.height)
      .attr('viewBox', [0, 0, dimensions.width, dimensions.height]);

    // Add zoom behavior
    const g = svg.append('g');

    const zoom = d3
      .zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.1, 4])
      .on('zoom', (event: d3.D3ZoomEvent<SVGSVGElement, unknown>) => {
        g.attr('transform', event.transform.toString());
      });

    svg.call(zoom);

    // Define arrow marker
    svg
      .append('defs')
      .selectAll('marker')
      .data(['end'])
      .join('marker')
      .attr('id', 'arrowhead')
      .attr('viewBox', '0 -5 10 10')
      .attr('refX', 20)
      .attr('refY', 0)
      .attr('markerWidth', 6)
      .attr('markerHeight', 6)
      .attr('orient', 'auto')
      .append('path')
      .attr('d', 'M0,-5L10,0L0,5')
      .attr('fill', '#94a3b8');

    // Create force simulation
    const simulation = d3
      .forceSimulation<GraphNode>(nodes)
      .force(
        'link',
        d3
          .forceLink<GraphNode, GraphLink>(links)
          .id((d: GraphNode) => d.id)
          .distance(100)
      )
      .force('charge', d3.forceManyBody().strength(-300))
      .force('center', d3.forceCenter(dimensions.width / 2, dimensions.height / 2))
      .force('collision', d3.forceCollide().radius(30));

    // Draw links
    const link = g
      .append('g')
      .selectAll('line')
      .data(links)
      .join('line')
      .attr('stroke', '#94a3b8')
      .attr('stroke-opacity', 0.6)
      .attr('stroke-width', (d: GraphLink) => (d.hops === 1 ? 2 : 1))
      .attr('marker-end', 'url(#arrowhead)');

    // Draw nodes
    const node = g
      .append('g')
      .selectAll<SVGGElement, GraphNode>('g')
      .data(nodes)
      .join('g')
      .call(
        d3
          .drag<SVGGElement, GraphNode>()
          .on('start', dragstarted)
          .on('drag', dragged)
          .on('end', dragended) as any
      );

    // Add circles
    node
      .append('circle')
      .attr('r', (d: GraphNode) => (d.type === 'affected' ? 12 : d.type === 'direct' ? 10 : 8))
      .attr('fill', (d: GraphNode) => {
        if (d.type === 'affected') return d.exists ? '#3b82f6' : '#8b5cf6';
        if (d.type === 'direct') return '#10b981';
        return '#f59e0b';
      })
      .attr('stroke', '#fff')
      .attr('stroke-width', 2);

    // Add labels
    node
      .append('text')
      .text((d: GraphNode) => d.label)
      .attr('x', 15)
      .attr('y', 4)
      .attr('font-size', '11px')
      .attr('font-family', 'monospace')
      .attr('fill', 'currentColor');

    // Add tooltips
    const tooltip = d3
      .select(containerRef.current)
      .append('div')
      .attr(
        'class',
        'absolute hidden bg-popover text-popover-foreground px-3 py-2 rounded-md shadow-md text-sm border z-50'
      )
      .style('pointer-events', 'none');

    node
      .on('mouseenter', (event: MouseEvent, d: GraphNode) => {
        tooltip
          .style('left', `${event.pageX + 10}px`)
          .style('top', `${event.pageY - 10}px`)
          .html(
            `
          <div class="font-mono font-semibold">${d.id}</div>
          <div class="text-xs text-muted-foreground mt-1">
            Type: ${d.type}<br/>
            Hops: ${d.hops}<br/>
            ${d.exists ? 'Exists' : 'New file'}
          </div>
        `
          )
          .classed('hidden', false);
      })
      .on('mouseleave', () => {
        tooltip.classed('hidden', true);
      });

    link
      .on('mouseenter', (event: MouseEvent, d: GraphLink) => {
        tooltip
          .style('left', `${event.pageX + 10}px`)
          .style('top', `${event.pageY - 10}px`)
          .html(
            `
          <div class="font-semibold">${d.relationship}</div>
          <div class="text-xs text-muted-foreground">Hops: ${d.hops}</div>
        `
          )
          .classed('hidden', false);
      })
      .on('mouseleave', () => {
        tooltip.classed('hidden', true);
      });

    // Update positions on tick
    simulation.on('tick', () => {
      link
        .attr('x1', (d: GraphLink) => (d.source as GraphNode).x!)
        .attr('y1', (d: GraphLink) => (d.source as GraphNode).y!)
        .attr('x2', (d: GraphLink) => (d.target as GraphNode).x!)
        .attr('y2', (d: GraphLink) => (d.target as GraphNode).y!);

      node.attr('transform', (d: GraphNode) => `translate(${d.x},${d.y})`);
    });

    // Drag functions
    function dragstarted(event: d3.D3DragEvent<SVGGElement, GraphNode, GraphNode>) {
      if (!event.active) simulation.alphaTarget(0.3).restart();
      event.subject.fx = event.subject.x;
      event.subject.fy = event.subject.y;
    }

    function dragged(event: d3.D3DragEvent<SVGGElement, GraphNode, GraphNode>) {
      event.subject.fx = event.x;
      event.subject.fy = event.y;
    }

    function dragended(event: d3.D3DragEvent<SVGGElement, GraphNode, GraphNode>) {
      if (!event.active) simulation.alphaTarget(0);
      event.subject.fx = null;
      event.subject.fy = null;
    }

    // Cleanup
    return () => {
      simulation.stop();
      tooltip.remove();
    };
  }, [affectedFiles, directImpacts, indirectImpacts, dimensions.width]);

  const handleZoomIn = () => {
    const svg = d3.select(svgRef.current);
    svg.transition().call(d3.zoom<SVGSVGElement, unknown>().scaleBy as any, 1.3);
  };

  const handleZoomOut = () => {
    const svg = d3.select(svgRef.current);
    svg.transition().call(d3.zoom<SVGSVGElement, unknown>().scaleBy as any, 0.7);
  };

  const handleReset = () => {
    const svg = d3.select(svgRef.current);
    svg.transition().call(d3.zoom<SVGSVGElement, unknown>().transform as any, d3.zoomIdentity);
  };

  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-2 text-xs">
              <div className="flex items-center gap-1">
                <div className="w-3 h-3 rounded-full bg-blue-500 border-2 border-white" />
                <span>Affected</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="w-2.5 h-2.5 rounded-full bg-green-500 border-2 border-white" />
                <span>Direct</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="w-2 h-2 rounded-full bg-orange-500 border-2 border-white" />
                <span>Indirect</span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <Button variant="outline" size="icon" className="h-8 w-8" onClick={handleZoomIn}>
              <ZoomIn className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="icon" className="h-8 w-8" onClick={handleZoomOut}>
              <ZoomOut className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="icon" className="h-8 w-8" onClick={handleReset}>
              <Maximize2 className="h-4 w-4" />
            </Button>
          </div>
        </div>
        <div ref={containerRef} className="relative w-full border rounded-lg bg-muted/30">
          <svg ref={svgRef} className="w-full" />
        </div>
        <p className="text-xs text-muted-foreground mt-2 text-center">
          Drag nodes to rearrange • Scroll to zoom • Hover for details
        </p>
      </CardContent>
    </Card>
  );
}
