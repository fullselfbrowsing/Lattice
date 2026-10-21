# Build the Information Systems Frontiers / design-science paper.
# The IEEE conference version is paper/ieee/main.tex (its own Makefile).
#
# Requires latexmk, article-class packages (natbib, booktabs, tabularx,
# geometry, hyperref, setspace, mathptmx), and the generated files
# numbers.tex, eval-tables.tex, Fig2.png, Fig3.png, and Fig4.png
# from eval/scripts/06-report.py.

MAIN := main

.PHONY: all pdf clean distclean

all: pdf

pdf:
	latexmk -pdf -interaction=nonstopmode -halt-on-error $(MAIN).tex

clean:
	latexmk -c $(MAIN).tex
	rm -f $(MAIN).bbl $(MAIN).blg

distclean:
	latexmk -C $(MAIN).tex
	rm -f $(MAIN).bbl $(MAIN).blg
