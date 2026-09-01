var activity = new function() {
	this.graph;
	this.options;
	this.view;
	this.span = 24;
	this.columns = [
		{id: "time", label: "Time", role: "domain", type: "string", calc: function(d, r) { return d.getValue(r, 0) + "h"; }},
		{id: "jumps", label: "Jumps", role: "data", type: "number", sourceColumn: 1, column: 1, title: "Jumps"},
		{id: "podkills", label: "Pod Kills", role: "data", type: "number", sourceColumn: 2, column: 2, title: "Pod Kills"},
		{id: "shipkills", label: "Ship Kills", role: "data", type: "number", sourceColumn: 3, column: 3, title: "Ship Kills"},
		{id: "npckills", label: "NPC Kills", role: "data", type: "number", sourceColumn: 4, column: 4, title: "NPC Kills"},
		//{id: "annotationLabel", label: "Test", role: "annotation", type: "string", sourceColumn: 5, title: "Test"},
		//{id: "annotationText", label: "Test", role: "annotationText", type: "string", sourceColumn: 6, title: "Test"}
	];

	this.getData = function(span, cache) {
		var span = typeof(span) !== "undefined" ? span : this.span;
		var cache = typeof(cache) !== "undefined" ? cache : true;

		// Google hasn't finished loading yet
		if (!activity.graph) {
				setTimeout(function() {activity.getData(span, cache)}, 500);
				return false;
		}

		return $.ajax({
			url: "activity_graph.php",
			data: {systemID: viewingSystemID, time: span},
			type: "GET",
			dataType: "JSON",
			cache: cache
		}).done(function(json) {
			if (json) {
				json.rows.reverse();
				activity.view = new google.visualization.DataView(new google.visualization.DataTable(json));
				activity.view.setColumns(activity.columns);

				// A window with almost no readings should not hold full height
				// for three gridlines and a dot.
				var withData = json.rows.filter(function(r) {
					return r.c.slice(1).some(function(c) { return c && c.v !== null && c.v > 0; });
				}).length;
				$("#activityGraph").toggleClass("is-sparse", withData < 3);

				activity.graph.draw(activity.view, activity.options);
			}
		});
	};

	this.selectHandler = function() {
		var selections = activity.graph.getSelection();

		if (selections[0] && selections[0].row == null) {
			var c = selections[0].column;

			if (activity.columns[c].sourceColumn) {
				//activity.columns[c].calc = function() { return null };
				activity.columns[c].label = activity.columns[c].title + " (off)";
				delete activity.columns[c].sourceColumn;
			} else {
				activity.columns[c].sourceColumn = activity.columns[c].column;
				activity.columns[c].label = activity.columns[c].title;
				//delete activity.columns[c].calc;
			}

			activity.view.setColumns(activity.columns);
			activity.options.animation.duration = 0;
			activity.graph.draw(activity.view, activity.options);
			activity.options.animation.duration = 500;
		}
	}

	// Chart styling reads from the design tokens rather than hard-coding hexes,
	// so the graph follows whichever theme is loaded instead of being a
	// differently-coloured island in the panel.
	this.tokens = function() {
		const cs = getComputedStyle(document.documentElement);
		const t = n => cs.getPropertyValue(n).trim();
		return {
			text:   t("--muted-foreground") || "#999",
			line:   t("--border")           || "#454545",
			jumps:  t("--data-info")        || "#47a2fe",
			pod:    t("--data-critical")    || "#ff4747",
			ship:   t("--data-warn")        || "#f5b544",
			npc:    t("--data-good")        || "#50d25a",
			font:   "Montserrat, system-ui, sans-serif"
		};
	};

	this.buildOptions = function() {
		const c = activity.tokens();
		const axis = {color: c.text, fontName: c.font, fontSize: 11};
		return {
			isStacked: false,
			backgroundColor: "transparent",

			// Series in the order the columns are declared: jumps, pod, ship, npc.
			// Semantic rather than decorative -- kills are danger colours, jumps
			// are neutral traffic.
			colors: [c.jumps, c.pod, c.ship, c.npc],
			areaOpacity: 0.18,
			lineWidth: 2,
			pointSize: 0,
			// A sparse window (a preview, or a gap in the cron) must read as
			// isolated readings rather than a line drawn through nothing.
			interpolateNulls: false,

			hAxis: {
				textStyle: axis,
				showTextEvery: 3,
				baselineColor: c.line,
				gridlines: {color: "transparent"}
			},
			vAxis: {
				textStyle: axis,
				viewWindowMode: "maximized",
				viewWindow: {min: 0},
				maxValue: 5,
				baselineColor: c.line,
				gridlines: {color: c.line, count: 4},
				minorGridlines: {count: 0}
			},

			height: 170,
			chartArea: {left: 48, top: 24, right: 12, bottom: 28},
			legend: {position: "top", alignment: "start",
			         textStyle: {color: c.text, fontName: c.font, fontSize: 11}},
			animation: {duration: 300, easing: "out"},
			tooltip: {showColorCode: true, textStyle: {fontName: c.font, fontSize: 12}},
			focusTarget: "category",
			crosshair: {trigger: "both", orientation: "vertical",
			            color: c.line, opacity: 0.6}
		};
	};

	this.init = function() {
		activity.graph = new google.visualization.AreaChart(document.getElementById("activityGraph"));
		activity.options = activity.buildOptions();

		google.visualization.events.addListener(activity.graph, "select", activity.selectHandler);

		activity.getData(activity.span);
	}

	this.time = function(span) {
		switch(span) {
			case 24:
				this.options.hAxis.showTextEvery = 3;
				break;
			case 48:
				this.options.hAxis.showTextEvery = 6;
				break;
			case 168:
				this.options.hAxis.showTextEvery = 24;
				break;
		}

		this.span = span;
		this.getData(span);
	}

	this.redraw = function() {
		this.graph.draw(this.view, this.options);
	}

	this.refresh = function(cache) {
		this.getData(this.span, cache);
	}

	google.charts.setOnLoadCallback(this.init);
}
